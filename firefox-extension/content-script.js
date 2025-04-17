/**
 * Content script per l'estensione Firefox
 * Si occupa di interagire direttamente con la pagina web
 */

// Raccoglie tutti i tipi di log e informazioni dalla pagina
class BrowserToolsCollector {
  constructor() {
    this.consoleLogs = [];
    this.consoleErrors = [];
    this.networkLogs = [];
    this.networkErrors = [];
    
    this.setupConsoleCapture();
    this.setupNetworkCapture();
  }

  // Cattura i log della console
  setupConsoleCapture() {
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const self = this;

    // Sostituisce console.log
    console.log = function(...args) {
      self.consoleLogs.push({
        timestamp: new Date().toISOString(),
        message: args.map(arg => {
          try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          } catch (e) {
            return String(arg);
          }
        }).join(' '),
        type: 'log'
      });
      originalConsoleLog.apply(console, args);
    };

    // Sostituisce console.error
    console.error = function(...args) {
      self.consoleErrors.push({
        timestamp: new Date().toISOString(),
        message: args.map(arg => {
          try {
            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
          } catch (e) {
            return String(arg);
          }
        }).join(' '),
        type: 'error'
      });
      originalConsoleError.apply(console, args);
    };
  }

  // Cattura le richieste di rete
  setupNetworkCapture() {
    const self = this;
    
    // Crea un intercettore di richieste
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
      const url = args[0] instanceof Request ? args[0].url : args[0];
      const method = args[0] instanceof Request ? args[0].method : (args[1]?.method || 'GET');
      
      const networkLog = {
        timestamp: new Date().toISOString(),
        url: url,
        method: method,
        status: null,
        responseType: null,
        duration: 0,
        isError: false
      };
      
      const startTime = Date.now();
      
      return originalFetch.apply(this, args)
        .then(response => {
          networkLog.status = response.status;
          networkLog.duration = Date.now() - startTime;
          networkLog.responseType = response.headers.get('content-type');
          
          if (!response.ok) {
            networkLog.isError = true;
            self.networkErrors.push(networkLog);
          }
          
          self.networkLogs.push(networkLog);
          return response;
        })
        .catch(error => {
          networkLog.isError = true;
          networkLog.status = 0;
          networkLog.duration = Date.now() - startTime;
          networkLog.errorMessage = error.message;
          
          self.networkErrors.push(networkLog);
          self.networkLogs.push(networkLog);
          
          throw error;
        });
    };
    
    // Cattura anche XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url) {
      this._networkLog = {
        timestamp: new Date().toISOString(),
        url: url,
        method: method,
        status: null,
        responseType: null,
        duration: 0,
        isError: false
      };
      originalXHROpen.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.send = function() {
      if (this._networkLog) {
        const startTime = Date.now();
        const self = this;
        
        this.addEventListener('load', function() {
          self._networkLog.status = self.status;
          self._networkLog.duration = Date.now() - startTime;
          self._networkLog.responseType = self.getResponseHeader('content-type');
          
          if (self.status >= 400) {
            self._networkLog.isError = true;
            BrowserToolsCollector.prototype.networkErrors.push(self._networkLog);
          }
          
          BrowserToolsCollector.prototype.networkLogs.push(self._networkLog);
        });
        
        this.addEventListener('error', function() {
          self._networkLog.isError = true;
          self._networkLog.status = 0;
          self._networkLog.duration = Date.now() - startTime;
          
          BrowserToolsCollector.prototype.networkErrors.push(self._networkLog);
          BrowserToolsCollector.prototype.networkLogs.push(self._networkLog);
        });
      }
      
      originalXHRSend.apply(this, arguments);
    };
  }

  // Cancella tutti i log
  clearAllLogs() {
    this.consoleLogs = [];
    this.consoleErrors = [];
    this.networkLogs = [];
    this.networkErrors = [];
    return true;
  }

  // Ottiene tutti i log di console
  getConsoleLogs() {
    return this.consoleLogs;
  }

  // Ottiene tutti gli errori di console
  getConsoleErrors() {
    return this.consoleErrors;
  }

  // Ottiene tutti i log di rete
  getNetworkLogs() {
    return this.networkLogs;
  }

  // Ottiene tutti gli errori di rete
  getNetworkErrors() {
    return this.networkErrors;
  }

  // Effettua uno screenshot
  takeScreenshot() {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const context = canvas.getContext('2d');
      
      // Utilizza html2canvas se esistente altrimenti fallisce in modo elegante
      if (typeof html2canvas !== 'undefined') {
        html2canvas(document.body).then(canvas => {
          resolve(canvas.toDataURL());
        });
      } else {
        resolve(null);
      }
    });
  }

  // Ottiene l'elemento selezionato
  getSelectedElement() {
    // Implementare quando necessario
    return null;
  }
}

// Inizializza il collector
const browserTools = new BrowserToolsCollector();

// Ascolta messaggi dal background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Messaggio ricevuto nel content script:", message);
  
  let response = { success: false, data: null };

  if (message.action === "getConsoleLogs") {
    response.data = browserTools.getConsoleLogs();
    response.success = true;
  } else if (message.action === "getConsoleErrors") {
    response.data = browserTools.getConsoleErrors();
    response.success = true;
  } else if (message.action === "getNetworkLogs") {
    response.data = browserTools.getNetworkLogs();
    response.success = true;
  } else if (message.action === "getNetworkErrors") {
    response.data = browserTools.getNetworkErrors();
    response.success = true;
  } else if (message.action === "takeScreenshot") {
    browserTools.takeScreenshot().then(screenshot => {
      response.data = screenshot;
      response.success = true;
      sendResponse(response);
    });
    return true; // Indica che la risposta sarà asincrona
  } else if (message.action === "getSelectedElement") {
    response.data = browserTools.getSelectedElement();
    response.success = true;
  } else if (message.action === "wipeLogs") {
    response.success = browserTools.clearAllLogs();
  }

  sendResponse(response);
  return true;
});

console.log("Content script di Browser Tools caricato"); 