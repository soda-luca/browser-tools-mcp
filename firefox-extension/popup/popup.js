document.addEventListener('DOMContentLoaded', () => {
  // Elementi dell'interfaccia
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  // Gestione delle tab
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const target = button.getAttribute('data-target');
      
      // Rimuovi la classe active da tutti i pulsanti e tab
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));
      
      // Aggiungi la classe active al pulsante e tab corrente
      button.classList.add('active');
      document.getElementById(target).classList.add('active');
    });
  });

  // Pulsanti della console
  document.getElementById('getConsoleLogs').addEventListener('click', getConsoleLogs);
  document.getElementById('getConsoleErrors').addEventListener('click', getConsoleErrors);
  document.getElementById('clearConsoleLogs').addEventListener('click', clearConsoleLogs);
  
  // Pulsanti della rete
  document.getElementById('getNetworkLogs').addEventListener('click', getNetworkLogs);
  document.getElementById('getNetworkErrors').addEventListener('click', getNetworkErrors);
  document.getElementById('clearNetworkLogs').addEventListener('click', clearNetworkLogs);
  
  // Pulsanti degli strumenti
  document.getElementById('takeScreenshot').addEventListener('click', takeScreenshot);
  document.getElementById('runAccessibilityAudit').addEventListener('click', runAccessibilityAudit);
  document.getElementById('runPerformanceAudit').addEventListener('click', runPerformanceAudit);
  document.getElementById('runSeoAudit').addEventListener('click', runSeoAudit);
  document.getElementById('runBestPracticesAudit').addEventListener('click', runBestPracticesAudit);
  document.getElementById('getSelectedElement').addEventListener('click', getSelectedElement);
  document.getElementById('runDebuggerMode').addEventListener('click', runDebuggerMode);
  document.getElementById('clearToolOutput').addEventListener('click', clearToolOutput);

  // Imposta la prima tab come attiva di default
  tabButtons[0].click();
});

// Funzioni per la console
function getConsoleLogs() {
  sendMessageToActiveTab({ action: 'getConsoleLogs' }, response => {
    displayLogs('consoleOutput', response, 'Console logs:');
  });
}

function getConsoleErrors() {
  sendMessageToActiveTab({ action: 'getConsoleErrors' }, response => {
    displayLogs('consoleOutput', response, 'Console errors:');
  });
}

function clearConsoleLogs() {
  sendMessageToActiveTab({ action: 'clearConsoleLogs' });
  document.getElementById('consoleOutput').textContent = 'Log console cancellati.';
}

// Funzioni per la rete
function getNetworkLogs() {
  sendMessageToActiveTab({ action: 'getNetworkLogs' }, response => {
    displayLogs('networkOutput', response, 'Network logs:');
  });
}

function getNetworkErrors() {
  sendMessageToActiveTab({ action: 'getNetworkErrors' }, response => {
    displayLogs('networkOutput', response, 'Network errors:');
  });
}

function clearNetworkLogs() {
  sendMessageToActiveTab({ action: 'clearNetworkLogs' });
  document.getElementById('networkOutput').textContent = 'Log di rete cancellati.';
}

// Funzioni per gli strumenti
function takeScreenshot() {
  sendMessageToActiveTab({ action: 'takeScreenshot' }, response => {
    const toolOutput = document.getElementById('toolOutput');
    toolOutput.innerHTML = '';
    
    if (response && response.dataUrl) {
      const img = document.createElement('img');
      img.id = 'screenshotImage';
      img.src = response.dataUrl;
      toolOutput.appendChild(img);
    } else {
      toolOutput.textContent = 'Errore durante l\'acquisizione dello screenshot.';
    }
  });
}

function runAccessibilityAudit() {
  sendMessageToActiveTab({ action: 'runAccessibilityAudit' }, response => {
    displayAuditResults('toolOutput', response, 'Risultati audit accessibilità:');
  });
}

function runPerformanceAudit() {
  sendMessageToActiveTab({ action: 'runPerformanceAudit' }, response => {
    displayAuditResults('toolOutput', response, 'Risultati audit performance:');
  });
}

function runSeoAudit() {
  sendMessageToActiveTab({ action: 'runSeoAudit' }, response => {
    displayAuditResults('toolOutput', response, 'Risultati audit SEO:');
  });
}

function runBestPracticesAudit() {
  sendMessageToActiveTab({ action: 'runBestPracticesAudit' }, response => {
    displayAuditResults('toolOutput', response, 'Risultati audit best practices:');
  });
}

function getSelectedElement() {
  sendMessageToActiveTab({ action: 'getSelectedElement' }, response => {
    const toolOutput = document.getElementById('toolOutput');
    if (response && response.html) {
      toolOutput.innerHTML = `<h3>Elemento selezionato:</h3><pre>${escapeHtml(response.html)}</pre>`;
    } else {
      toolOutput.textContent = 'Nessun elemento selezionato o errore durante il recupero.';
    }
  });
}

function runDebuggerMode() {
  sendMessageToActiveTab({ action: 'runDebuggerMode' });
  document.getElementById('toolOutput').textContent = 'Modalità debugger avviata. Controlla la console del browser.';
}

function clearToolOutput() {
  document.getElementById('toolOutput').textContent = '';
}

// Funzioni di utilità
function sendMessageToActiveTab(message, callback) {
  browser.tabs.query({ active: true, currentWindow: true })
    .then(tabs => {
      if (tabs.length > 0) {
        return browser.tabs.sendMessage(tabs[0].id, message);
      }
      throw new Error('Nessuna scheda attiva trovata');
    })
    .then(response => {
      if (callback) callback(response);
    })
    .catch(error => {
      console.error('Errore di comunicazione con la scheda:', error);
      if (callback) callback({ error: error.message });
    });
}

function displayLogs(elementId, response, title) {
  const outputElement = document.getElementById(elementId);
  
  if (response && response.logs && response.logs.length > 0) {
    let output = `<strong>${title}</strong><br>`;
    
    response.logs.forEach(log => {
      output += `<pre>${escapeHtml(typeof log === 'object' ? JSON.stringify(log, null, 2) : log)}</pre>`;
    });
    
    outputElement.innerHTML = output;
  } else if (response && response.error) {
    outputElement.innerHTML = `<strong>Errore:</strong> ${escapeHtml(response.error)}`;
  } else {
    outputElement.textContent = 'Nessun log trovato.';
  }
}

function displayAuditResults(elementId, response, title) {
  const outputElement = document.getElementById(elementId);
  
  if (response && response.results) {
    let output = `<strong>${title}</strong><br>`;
    output += `<pre>${escapeHtml(typeof response.results === 'object' ? JSON.stringify(response.results, null, 2) : response.results)}</pre>`;
    outputElement.innerHTML = output;
  } else if (response && response.error) {
    outputElement.innerHTML = `<strong>Errore:</strong> ${escapeHtml(response.error)}`;
  } else {
    outputElement.textContent = 'Nessun risultato trovato.';
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
} 