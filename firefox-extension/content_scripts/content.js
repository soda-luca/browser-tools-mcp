// Array per memorizzare i log
let consoleLogs = [];
let consoleErrors = [];
let networkLogs = [];
let networkErrors = [];

// Inizializzazione
(function() {
  console.log("Browser Tools Extension: Content script inizializzato");
  
  // Intercetta i console.log e console.error
  setupConsoleInterception();
  
  // Attiva l'intercettazione delle richieste di rete
  setupNetworkInterception();
  
  // Gestisci i messaggi dal popup
  browser.runtime.onMessage.addListener(handleMessage);
})();

// Funzione per gestire i messaggi dal popup
function handleMessage(message, sender, sendResponse) {
  console.log("Messaggio ricevuto dal popup:", message);
  
  switch(message.action) {
    case 'getConsoleLogs':
      sendResponse({ logs: consoleLogs });
      break;
      
    case 'getConsoleErrors':
      sendResponse({ logs: consoleErrors });
      break;
      
    case 'clearConsoleLogs':
      consoleLogs = [];
      consoleErrors = [];
      sendResponse({ success: true });
      break;
      
    case 'getNetworkLogs':
      sendResponse({ logs: networkLogs });
      break;
      
    case 'getNetworkErrors':
      sendResponse({ logs: networkErrors });
      break;
      
    case 'clearNetworkLogs':
      networkLogs = [];
      networkErrors = [];
      sendResponse({ success: true });
      break;
      
    case 'takeScreenshot':
      takeScreenshot().then(dataUrl => {
        sendResponse({ dataUrl });
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      return true; // Indica che la risposta sarà asincrona
      
    case 'runAccessibilityAudit':
      runAccessibilityAudit().then(results => {
        sendResponse({ results });
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      return true;
      
    case 'runPerformanceAudit':
      runPerformanceAudit().then(results => {
        sendResponse({ results });
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      return true;
      
    case 'runSeoAudit':
      runSeoAudit().then(results => {
        sendResponse({ results });
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      return true;
      
    case 'runBestPracticesAudit':
      runBestPracticesAudit().then(results => {
        sendResponse({ results });
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      return true;
      
    case 'getSelectedElement':
      getSelectedElement().then(html => {
        sendResponse({ html });
      }).catch(error => {
        sendResponse({ error: error.message });
      });
      return true;
      
    case 'runDebuggerMode':
      runDebuggerMode();
      sendResponse({ success: true });
      break;
      
    default:
      sendResponse({ error: 'Azione non supportata' });
  }
}

// Intercetta i log della console
function setupConsoleInterception() {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  
  // Sostituisci console.log
  console.log = function(...args) {
    // Limita la dimensione degli array per evitare problemi di memoria
    if (consoleLogs.length > 500) {
      consoleLogs.shift();
    }
    
    // Aggiungi il log all'array
    try {
      const logEntry = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      consoleLogs.push(logEntry);
    } catch (e) {
      consoleLogs.push('[Oggetto non serializzabile]');
    }
    
    // Chiama la funzione originale
    originalConsoleLog.apply(console, args);
  };
  
  // Sostituisci console.error
  console.error = function(...args) {
    // Limita la dimensione degli array
    if (consoleErrors.length > 500) {
      consoleErrors.shift();
    }
    
    // Aggiungi l'errore all'array
    try {
      const errorEntry = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      consoleErrors.push(errorEntry);
    } catch (e) {
      consoleErrors.push('[Errore non serializzabile]');
    }
    
    // Chiama la funzione originale
    originalConsoleError.apply(console, args);
  };
}

// Intercetta le richieste di rete
function setupNetworkInterception() {
  // Usa l'API Performance per monitorare le richieste di rete
  if (window.PerformanceObserver) {
    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          // Registra solo le richieste HTTP
          if (entry.entryType === 'resource') {
            const networkEntry = {
              url: entry.name,
              startTime: entry.startTime,
              duration: entry.duration,
              initiatorType: entry.initiatorType,
              size: entry.transferSize || 0,
              timestamp: new Date().toISOString()
            };
            
            // Limita la dimensione degli array
            if (networkLogs.length > 500) {
              networkLogs.shift();
            }
            
            networkLogs.push(networkEntry);
            
            // Controlla se è un errore (approssimazione)
            // In realtà, PerformanceObserver non fornisce direttamente info sugli errori
            // Per una soluzione più accurata, si dovrebbe usare fetch o XHR hook
            if (entry.duration > 10000 || entry.transferSize === 0) {
              if (networkErrors.length > 500) {
                networkErrors.shift();
              }
              networkErrors.push({
                ...networkEntry,
                possibleError: true
              });
            }
          }
        });
      });
      
      // Osserva le risorse
      observer.observe({ entryTypes: ['resource'] });
      
    } catch (error) {
      console.error('Errore durante l\'intercettazione delle richieste di rete:', error);
    }
  }
  
  // Interfaccia anche con fetch e XMLHttpRequest per tenere traccia degli errori
  setupFetchInterception();
  setupXHRInterception();
}

// Intercetta le chiamate fetch
function setupFetchInterception() {
  const originalFetch = window.fetch;
  
  window.fetch = function(...args) {
    const url = args[0] instanceof Request ? args[0].url : String(args[0]);
    const startTime = performance.now();
    const fetchPromise = originalFetch.apply(this, args);
    
    fetchPromise
      .then(response => {
        const endTime = performance.now();
        const duration = endTime - startTime;
        
        // Registra tutte le richieste
        const entry = {
          type: 'fetch',
          url,
          method: args[1]?.method || 'GET',
          duration,
          status: response.status,
          ok: response.ok,
          timestamp: new Date().toISOString()
        };
        
        if (networkLogs.length > 500) {
          networkLogs.shift();
        }
        networkLogs.push(entry);
        
        // Registra gli errori (status code >= 400)
        if (!response.ok) {
          if (networkErrors.length > 500) {
            networkErrors.shift();
          }
          networkErrors.push({
            ...entry,
            error: `HTTP error ${response.status}: ${response.statusText}`
          });
        }
        
        return response;
      })
      .catch(error => {
        const endTime = performance.now();
        const errorEntry = {
          type: 'fetch',
          url,
          method: args[1]?.method || 'GET',
          duration: endTime - startTime,
          error: error.message,
          timestamp: new Date().toISOString()
        };
        
        if (networkErrors.length > 500) {
          networkErrors.shift();
        }
        networkErrors.push(errorEntry);
        
        throw error; // Rilancia l'errore
      });
    
    return fetchPromise;
  };
}

// Intercetta le chiamate XMLHttpRequest
function setupXHRInterception() {
  const XHR = XMLHttpRequest.prototype;
  
  // Salva i metodi originali
  const originalOpen = XHR.open;
  const originalSend = XHR.send;
  
  XHR.open = function(method, url) {
    this._method = method;
    this._url = url;
    this._startTime = performance.now();
    return originalOpen.apply(this, arguments);
  };
  
  XHR.send = function() {
    // Salva riferimento al contesto corrente
    const xhr = this;
    
    // Aggiungi ascoltatori di eventi
    xhr.addEventListener('load', function() {
      const duration = performance.now() - xhr._startTime;
      
      // Registra la richiesta
      const entry = {
        type: 'xhr',
        url: xhr._url,
        method: xhr._method,
        duration,
        status: xhr.status,
        ok: xhr.status >= 200 && xhr.status < 300,
        timestamp: new Date().toISOString()
      };
      
      if (networkLogs.length > 500) {
        networkLogs.shift();
      }
      networkLogs.push(entry);
      
      // Registra errori (status code >= 400)
      if (xhr.status >= 400) {
        if (networkErrors.length > 500) {
          networkErrors.shift();
        }
        networkErrors.push({
          ...entry,
          error: `HTTP error ${xhr.status}`
        });
      }
    });
    
    xhr.addEventListener('error', function() {
      const errorEntry = {
        type: 'xhr',
        url: xhr._url,
        method: xhr._method,
        duration: performance.now() - xhr._startTime,
        error: 'Network error',
        timestamp: new Date().toISOString()
      };
      
      if (networkErrors.length > 500) {
        networkErrors.shift();
      }
      networkErrors.push(errorEntry);
    });
    
    xhr.addEventListener('timeout', function() {
      const errorEntry = {
        type: 'xhr',
        url: xhr._url,
        method: xhr._method,
        duration: performance.now() - xhr._startTime,
        error: 'Timeout',
        timestamp: new Date().toISOString()
      };
      
      if (networkErrors.length > 500) {
        networkErrors.shift();
      }
      networkErrors.push(errorEntry);
    });
    
    return originalSend.apply(this, arguments);
  };
}

// Funzione per acquisire screenshot della pagina
function takeScreenshot() {
  return new Promise((resolve, reject) => {
    try {
      // Tentiamo di usare l'API html2canvas se disponibile
      if (typeof html2canvas !== 'undefined') {
        html2canvas(document.documentElement, {
          scale: 0.7, // Scala per ridurre dimensioni
          logging: false
        }).then(canvas => {
          resolve(canvas.toDataURL('image/png'));
        }).catch(error => {
          reject(new Error(`Errore durante la cattura dello screenshot: ${error.message}`));
        });
      } else {
        // In alternativa, inviamo un messaggio alla pagina background per utilizzare l'API browser
        browser.runtime.sendMessage({ action: 'captureScreenshot' })
          .then(response => {
            if (response && response.dataUrl) {
              resolve(response.dataUrl);
            } else {
              reject(new Error('Impossibile acquisire screenshot'));
            }
          })
          .catch(error => {
            reject(new Error(`Errore durante l'acquisizione dello screenshot: ${error.message}`));
          });
      }
    } catch (error) {
      reject(new Error(`Errore durante l'acquisizione dello screenshot: ${error.message}`));
    }
  });
}

// Funzione per ottenere l'elemento selezionato
function getSelectedElement() {
  return new Promise((resolve, reject) => {
    try {
      // Controlla se c'è un elemento selezionato
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        let element = range.commonAncestorContainer;
        
        // Se è un nodo di testo, prendi il genitore
        if (element.nodeType === Node.TEXT_NODE) {
          element = element.parentNode;
        }
        
        if (element) {
          // Prendi l'HTML dell'elemento con un limite di dimensioni ragionevole
          const html = element.outerHTML;
          if (html.length > 10000) {
            resolve(html.substring(0, 10000) + '... [contenuto troncato]');
          } else {
            resolve(html);
          }
        } else {
          resolve(null);
        }
      } else {
        resolve(null);
      }
    } catch (error) {
      reject(error);
    }
  });
}

// Funzione per eseguire un audit di accessibilità
function runAccessibilityAudit() {
  return new Promise((resolve, reject) => {
    try {
      // Struttura base per conservare i risultati
      const results = {
        violations: [],
        passes: [],
        summary: {
          violations: 0,
          passes: 0
        }
      };
      
      // Controlla etichette per i campi del modulo
      const inputsWithoutLabels = Array.from(document.querySelectorAll('input, select, textarea')).filter(input => {
        const id = input.getAttribute('id');
        if (!id) return true;
        
        const label = document.querySelector(`label[for="${id}"]`);
        const ariaLabel = input.getAttribute('aria-label');
        const ariaLabelledBy = input.getAttribute('aria-labelledby');
        
        return !label && !ariaLabel && !ariaLabelledBy;
      });
      
      if (inputsWithoutLabels.length > 0) {
        results.violations.push({
          id: 'input-without-label',
          description: 'Campi modulo senza etichette',
          impact: 'serious',
          elements: inputsWithoutLabels.map(el => ({ 
            html: el.outerHTML.substring(0, 100),
            tagName: el.tagName
          })).slice(0, 5)
        });
      }
      
      // Controlla attributi alt nelle immagini
      const imagesWithoutAlt = Array.from(document.querySelectorAll('img')).filter(img => {
        return !img.hasAttribute('alt');
      });
      
      if (imagesWithoutAlt.length > 0) {
        results.violations.push({
          id: 'img-without-alt',
          description: 'Immagini senza attributo alt',
          impact: 'serious',
          elements: imagesWithoutAlt.map(el => ({ 
            html: el.outerHTML.substring(0, 100),
            src: el.src.substring(0, 100)
          })).slice(0, 5)
        });
      }
      
      // Verifica contrasto colore (semplificato)
      const lowContrastElements = [];
      const textElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, span, a, button, li');
      
      textElements.forEach(el => {
        const style = window.getComputedStyle(el);
        const bgColor = style.backgroundColor;
        const color = style.color;
        
        // Controllo molto semplificato del contrasto
        if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
          // Ignora elementi con sfondo trasparente
          return;
        }
        
        if (
          (bgColor === 'rgb(255, 255, 255)' && color === 'rgb(255, 255, 255)') ||
          (bgColor === 'rgb(0, 0, 0)' && color === 'rgb(0, 0, 0)')
        ) {
          lowContrastElements.push(el);
        }
      });
      
      if (lowContrastElements.length > 0) {
        results.violations.push({
          id: 'low-contrast',
          description: 'Elementi con contrasto insufficiente',
          impact: 'moderate',
          elements: lowContrastElements.map(el => ({ 
            html: el.outerHTML.substring(0, 100),
            tagName: el.tagName
          })).slice(0, 5)
        });
      }
      
      // Aggiorna il sommario
      results.summary.violations = results.violations.length;
      results.summary.passes = results.passes.length;
      
      resolve(results);
    } catch (error) {
      reject(error);
    }
  });
}

// Funzione per eseguire un audit di performance
function runPerformanceAudit() {
  return new Promise((resolve, reject) => {
    try {
      // Raccoglie i dati di performance dalla Navigation Timing API
      const navigationTiming = performance.getEntriesByType('navigation')[0];
      const paintTiming = performance.getEntriesByType('paint');
      
      const firstPaint = paintTiming.find(entry => entry.name === 'first-paint');
      const firstContentfulPaint = paintTiming.find(entry => entry.name === 'first-contentful-paint');
      
      // Raccolta dati risorse
      const resourceEntries = performance.getEntriesByType('resource');
      const totalResources = resourceEntries.length;
      const totalResourceSize = resourceEntries.reduce((total, entry) => total + (entry.transferSize || 0), 0);
      
      // Trova le risorse più grandi
      const largestResources = [...resourceEntries]
        .sort((a, b) => (b.transferSize || 0) - (a.transferSize || 0))
        .slice(0, 5)
        .map(entry => ({
          name: entry.name,
          type: entry.initiatorType,
          size: formatBytes(entry.transferSize || 0),
          duration: Math.round(entry.duration)
        }));
      
      // Calcola metriche di performance
      const results = {
        timing: {
          domInteractive: Math.round(navigationTiming?.domInteractive || 0),
          domContentLoaded: Math.round(navigationTiming?.domContentLoadedEventEnd || 0),
          loadComplete: Math.round(navigationTiming?.loadEventEnd || 0),
          firstPaint: Math.round(firstPaint?.startTime || 0),
          firstContentfulPaint: Math.round(firstContentfulPaint?.startTime || 0),
        },
        resources: {
          total: totalResources,
          totalSize: formatBytes(totalResourceSize),
          largest: largestResources
        },
        suggestions: []
      };
      
      // Genera suggerimenti
      if (results.timing.loadComplete > 3000) {
        results.suggestions.push('Il tempo di caricamento della pagina supera i 3 secondi. Considerare l\'ottimizzazione.');
      }
      
      if (totalResources > 50) {
        results.suggestions.push(`La pagina carica ${totalResources} risorse. Considerare di ridurre questo numero.`);
      }
      
      if (totalResourceSize > 3 * 1024 * 1024) {
        results.suggestions.push(`La dimensione totale delle risorse è ${formatBytes(totalResourceSize)}. Considerare l'ottimizzazione delle immagini e la minificazione.`);
      }
      
      resolve(results);
    } catch (error) {
      reject(error);
    }
  });
}

// Formatta i byte in una stringa leggibile
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Funzione per eseguire un audit SEO
function runSeoAudit() {
  return new Promise((resolve, reject) => {
    try {
      const results = {
        violations: [],
        passes: [],
        summary: {
          score: 0,
          maxScore: 0
        }
      };
      
      let score = 0;
      let maxScore = 0;
      
      // Verifica titolo della pagina
      maxScore++;
      const pageTitle = document.title;
      if (pageTitle && pageTitle.length > 5 && pageTitle.length < 60) {
        score++;
        results.passes.push({
          id: 'valid-title',
          description: 'Il titolo della pagina ha una lunghezza adeguata',
          detail: `"${pageTitle}" (${pageTitle.length} caratteri)`
        });
      } else {
        results.violations.push({
          id: 'invalid-title',
          description: 'Il titolo della pagina è assente o ha una lunghezza non ottimale',
          detail: pageTitle ? `"${pageTitle}" (${pageTitle.length} caratteri)` : 'Titolo mancante'
        });
      }
      
      // Verifica meta description
      maxScore++;
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription && metaDescription.content && metaDescription.content.length > 50 && metaDescription.content.length < 160) {
        score++;
        results.passes.push({
          id: 'valid-meta-description',
          description: 'La meta description ha una lunghezza adeguata',
          detail: `"${metaDescription.content.substring(0, 50)}..." (${metaDescription.content.length} caratteri)`
        });
      } else {
        results.violations.push({
          id: 'invalid-meta-description',
          description: 'La meta description è assente o ha una lunghezza non ottimale',
          detail: metaDescription?.content ? `"${metaDescription.content.substring(0, 50)}..." (${metaDescription.content.length} caratteri)` : 'Meta description mancante'
        });
      }
      
      // Verifica heading gerarchici
      maxScore++;
      const h1Elements = document.querySelectorAll('h1');
      if (h1Elements.length === 1) {
        score++;
        results.passes.push({
          id: 'valid-h1',
          description: 'La pagina contiene esattamente un elemento H1',
          detail: `"${h1Elements[0].textContent.substring(0, 50)}..."`
        });
      } else {
        results.violations.push({
          id: 'invalid-h1',
          description: 'La pagina deve contenere esattamente un elemento H1',
          detail: `Trovati ${h1Elements.length} elementi H1`
        });
      }
      
      // Verifica URL friendly
      maxScore++;
      const url = window.location.href;
      const hasCleanUrl = !url.includes('?') && !url.includes('#') && 
                          !url.match(/\d{10,}/) && 
                          !url.match(/[A-F0-9]{32}/i);
      if (hasCleanUrl) {
        score++;
        results.passes.push({
          id: 'seo-friendly-url',
          description: 'L\'URL della pagina è SEO-friendly',
          detail: url
        });
      } else {
        results.violations.push({
          id: 'non-seo-friendly-url',
          description: 'L\'URL della pagina potrebbe non essere ottimale per SEO',
          detail: url
        });
      }
      
      // Verifica immagini con attributo alt
      maxScore++;
      const images = document.querySelectorAll('img');
      const imagesWithAlt = Array.from(images).filter(img => img.hasAttribute('alt'));
      
      if (images.length === 0 || (images.length > 0 && imagesWithAlt.length === images.length)) {
        score++;
        results.passes.push({
          id: 'images-with-alt',
          description: 'Tutte le immagini hanno un attributo alt',
          detail: `${imagesWithAlt.length}/${images.length} immagini con attributo alt`
        });
      } else {
        results.violations.push({
          id: 'images-without-alt',
          description: 'Non tutte le immagini hanno un attributo alt',
          detail: `${imagesWithAlt.length}/${images.length} immagini con attributo alt`
        });
      }
      
      // Aggiorna il sommario
      results.summary.score = score;
      results.summary.maxScore = maxScore;
      
      resolve(results);
    } catch (error) {
      reject(error);
    }
  });
}

// Funzione per eseguire un audit best practices
function runBestPracticesAudit() {
  return new Promise((resolve, reject) => {
    try {
      const results = {
        violations: [],
        passes: [],
        summary: {
          score: 0,
          maxScore: 0
        }
      };
      
      let score = 0;
      let maxScore = 0;
      
      // Verifica HTTPS
      maxScore++;
      if (window.location.protocol === 'https:') {
        score++;
        results.passes.push({
          id: 'uses-https',
          description: 'Il sito utilizza HTTPS',
          detail: window.location.href
        });
      } else {
        results.violations.push({
          id: 'not-uses-https',
          description: 'Il sito non utilizza HTTPS',
          detail: window.location.href
        });
      }
      
      // Verifica DOCTYPE
      maxScore++;
      const doctype = document.doctype;
      if (doctype && doctype.name.toLowerCase() === 'html') {
        score++;
        results.passes.push({
          id: 'has-doctype',
          description: 'La pagina ha un doctype HTML5 valido',
          detail: '<!DOCTYPE html>'
        });
      } else {
        results.violations.push({
          id: 'missing-doctype',
          description: 'La pagina non ha un doctype HTML5 valido',
          detail: doctype ? `<!DOCTYPE ${doctype.name}>` : 'DOCTYPE mancante'
        });
      }
      
      // Verifica caratteri di codifica
      maxScore++;
      const charset = document.querySelector('meta[charset], meta[http-equiv="Content-Type"]');
      if (charset) {
        score++;
        results.passes.push({
          id: 'has-charset',
          description: 'La pagina specifica la codifica dei caratteri',
          detail: charset.outerHTML
        });
      } else {
        results.violations.push({
          id: 'missing-charset',
          description: 'La pagina non specifica la codifica dei caratteri',
          detail: 'Nessun meta charset trovato'
        });
      }
      
      // Verifica viewport per dispositivi mobili
      maxScore++;
      const viewport = document.querySelector('meta[name="viewport"]');
      if (viewport) {
        score++;
        results.passes.push({
          id: 'has-viewport',
          description: 'La pagina specifica un viewport per dispositivi mobili',
          detail: viewport.outerHTML
        });
      } else {
        results.violations.push({
          id: 'missing-viewport',
          description: 'La pagina non specifica un viewport per dispositivi mobili',
          detail: 'Nessun meta viewport trovato'
        });
      }
      
      // Verifica collegamenti Javascript senza async/defer
      maxScore++;
      const scripts = document.querySelectorAll('script[src]');
      const blockedScripts = Array.from(scripts).filter(script => {
        return !script.async && !script.defer;
      });
      
      if (blockedScripts.length === 0) {
        score++;
        results.passes.push({
          id: 'non-blocking-scripts',
          description: 'Tutti gli script hanno attributi async o defer',
          detail: `${scripts.length - blockedScripts.length}/${scripts.length} script non bloccanti`
        });
      } else {
        results.violations.push({
          id: 'blocking-scripts',
          description: 'Alcuni script potrebbero bloccare il rendering',
          detail: `${blockedScripts.length}/${scripts.length} script potenzialmente bloccanti`
        });
      }
      
      // Aggiorna il sommario
      results.summary.score = score;
      results.summary.maxScore = maxScore;
      
      resolve(results);
    } catch (error) {
      reject(error);
    }
  });
}

// Funzione per eseguire la modalità debugger
function runDebuggerMode() {
  console.log("Browser Tools Extension: Modalità debugger avviata");
  
  // Stampa informazioni utili per il debug
  console.log("Window location:", window.location.href);
  console.log("User Agent:", navigator.userAgent);
  console.log("Viewport dimensions:", {
    width: window.innerWidth,
    height: window.innerHeight
  });
  
  // Stampa errori JS esistenti
  console.log("Console errors:", consoleErrors);
  
  // Stampa errori di rete esistenti
  console.log("Network errors:", networkErrors);
  
  // Fornisce suggerimenti
  console.log("Suggerimenti di debug:");
  console.log("1. Controllare la console per errori JavaScript");
  console.log("2. Controllare la rete per richieste fallite");
  console.log("3. Verificare problemi di dimensionamento e layout");
} 