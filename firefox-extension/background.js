/**
 * Background script per l'estensione Firefox
 * Gestisce le comunicazioni tra i vari componenti dell'estensione
 */

// Oggetto per memorizzare tutti i log e gli errori
let storedData = {
  consoleLogs: [],
  consoleErrors: [],
  networkLogs: [],
  networkErrors: []
};

// Ascolta i messaggi dal popup e dai content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Messaggio ricevuto nel background:", message);

  if (message.action === "getStoredData") {
    sendResponse(storedData);
    return true;
  }

  // Inoltra il messaggio al content script della tab attiva
  if (message.target === "content") {
    browser.tabs.query({ active: true, currentWindow: true })
      .then(tabs => {
        if (tabs && tabs[0]) {
          return browser.tabs.sendMessage(tabs[0].id, message);
        }
      })
      .then(response => {
        console.log("Risposta dal content script:", response);
        
        // Aggiorna i dati memorizzati se necessario
        if (response && response.data) {
          if (message.action === "getConsoleLogs") {
            storedData.consoleLogs = response.data;
          } else if (message.action === "getConsoleErrors") {
            storedData.consoleErrors = response.data;
          } else if (message.action === "getNetworkLogs") {
            storedData.networkLogs = response.data;
          } else if (message.action === "getNetworkErrors") {
            storedData.networkErrors = response.data;
          } else if (message.action === "wipeLogs") {
            storedData = {
              consoleLogs: [],
              consoleErrors: [],
              networkLogs: [],
              networkErrors: []
            };
          }
        }
        
        // Inoltra la risposta al popup
        if (message.responseId) {
          browser.runtime.sendMessage({
            responseId: message.responseId,
            data: response
          });
        }
      })
      .catch(error => {
        console.error("Errore nell'inoltro del messaggio:", error);
      });
    
    return true;
  }

  if (message.type === "GET_CURRENT_URL" && message.tabId) {
    getCurrentTabUrl(message.tabId)
      .then((url) => {
        sendResponse({ success: true, url: url });
      })
      .catch((error) => {
        sendResponse({ success: false, error: error.message });
      });
    return true; // Required to use sendResponse asynchronously
  }

  // Handle explicit request to update the server with the URL
  if (message.type === "UPDATE_SERVER_URL" && message.tabId && message.url) {
    console.log(
      `Background: Received request to update server with URL for tab ${message.tabId}: ${message.url}`
    );
    updateServerWithUrl(
      message.tabId,
      message.url,
      message.source || "explicit_update"
    )
      .then(() => {
        if (sendResponse) sendResponse({ success: true });
      })
      .catch((error) => {
        console.error("Background: Error updating server with URL:", error);
        if (sendResponse)
          sendResponse({ success: false, error: error.message });
      });
    return true; // Required to use sendResponse asynchronously
  }

  if (message.type === "CAPTURE_SCREENSHOT" && message.tabId) {
    // First get the server settings
    browser.storage.local.get(["browserConnectorSettings"]).then((result) => {
      const settings = result.browserConnectorSettings || {
        serverHost: "localhost",
        serverPort: 3025,
      };

      // Validate server identity first
      validateServerIdentity(settings.serverHost, settings.serverPort)
        .then((isValid) => {
          if (!isValid) {
            console.error(
              "Cannot capture screenshot: Not connected to a valid browser tools server"
            );
            sendResponse({
              success: false,
              error:
                "Not connected to a valid browser tools server. Please check your connection settings.",
            });
            return;
          }

          // Continue with screenshot capture
          captureAndSendScreenshot(message, settings, sendResponse);
        })
        .catch((error) => {
          console.error("Error validating server:", error);
          sendResponse({
            success: false,
            error: "Failed to validate server identity: " + error.message,
          });
        });
    });
    return true; // Required to use sendResponse asynchronously
  }

  switch (message.action) {
    case 'captureScreenshot':
      captureScreenshot(sender.tab.id)
        .then(dataUrl => {
          sendResponse({ dataUrl });
        })
        .catch(error => {
          console.error("Errore durante l'acquisizione dello screenshot:", error);
          sendResponse({ error: error.message });
        });
      return true; // Indica che la risposta sarà asincrona
      
    case 'runSystemAudit':
      // Qui si potrebbero eseguire operazioni che richiedono permessi elevati
      sendResponse({ result: "Audit completato" });
      break;
      
    default:
      console.log("Azione non supportata:", message.action);
      sendResponse({ error: "Azione non supportata" });
  }
});

// Ascolta quando viene installata l'estensione
browser.runtime.onInstalled.addListener(() => {
  console.log("Browser Tools Extension: Installata");
});

console.log("Background script caricato");

// Validate server identity
async function validateServerIdentity(host, port) {
  try {
    const response = await fetch(`http://${host}:${port}/.identity`, {
      // Firefox doesn't support AbortSignal.timeout, use a standard timeout instead
      timeout: 3000
    });

    if (!response.ok) {
      console.error(`Invalid server response: ${response.status}`);
      return false;
    }

    const identity = await response.json();

    // Validate the server signature
    if (identity.signature !== "mcp-browser-connector-24x7") {
      console.error("Invalid server signature - not the browser tools server");
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error validating server identity:", error);
    return false;
  }
}

// Helper function to process the tab and run the audit
function processTabForAudit(tab, tabId) {
  const url = tab.url;

  if (!url) {
    console.error(`No URL available for tab ${tabId}`);
    return;
  }

  // Update our cache and the server with this URL
  tabUrls.set(tabId, url);
  updateServerWithUrl(tabId, url);
}

// Track URLs for each tab
const tabUrls = new Map();

// Function to get the current URL for a tab
async function getCurrentTabUrl(tabId) {
  try {
    console.log("Background: Getting URL for tab", tabId);

    // First check if we have it cached
    if (tabUrls.has(tabId)) {
      const cachedUrl = tabUrls.get(tabId);
      console.log("Background: Found cached URL:", cachedUrl);
      return cachedUrl;
    }

    // Otherwise get it from the tab
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab && tab.url) {
        // Cache the URL
        tabUrls.set(tabId, tab.url);
        console.log("Background: Got URL from tab:", tab.url);
        return tab.url;
      } else {
        console.log("Background: Tab exists but no URL found");
      }
    } catch (tabError) {
      console.error("Background: Error getting tab:", tabError);
    }

    // If we can't get the tab directly, try querying for active tabs
    try {
      const tabs = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs && tabs.length > 0 && tabs[0].url) {
        const activeUrl = tabs[0].url;
        console.log("Background: Got URL from active tab:", activeUrl);
        // Cache this URL as well
        tabUrls.set(tabId, activeUrl);
        return activeUrl;
      }
    } catch (queryError) {
      console.error("Background: Error querying tabs:", queryError);
    }

    console.log("Background: Could not find URL for tab", tabId);
    return null;
  } catch (error) {
    console.error("Background: Error getting tab URL:", error);
    return null;
  }
}

// Listen for tab updates to detect page refreshes and URL changes
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Track URL changes
  if (changeInfo.url) {
    console.log(`URL changed in tab ${tabId} to ${changeInfo.url}`);
    tabUrls.set(tabId, changeInfo.url);

    // Send URL update to server if possible
    updateServerWithUrl(tabId, changeInfo.url, "tab_url_change");
  }

  // Check if this is a page refresh (status becoming "complete")
  if (changeInfo.status === "complete") {
    // Update URL in our cache
    if (tab.url) {
      tabUrls.set(tabId, tab.url);
      // Send URL update to server if possible
      updateServerWithUrl(tabId, tab.url, "page_complete");
    }

    retestConnectionOnRefresh(tabId);
  }
});

// Listen for tab activation (switching between tabs)
browser.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  console.log(`Tab activated: ${tabId}`);

  // Get the URL of the newly activated tab
  browser.tabs.get(tabId)
    .then((tab) => {
      if (tab && tab.url) {
        console.log(`Tab ${tabId} URL: ${tab.url}`);
        // Cache the URL
        tabUrls.set(tabId, tab.url);
        // Send URL update to server
        updateServerWithUrl(tabId, tab.url, "tab_activation");
      }
    })
    .catch((error) => {
      console.error(`Error getting tab ${tabId}:`, error);
    });
});

// Check connection when a page refreshes
async function retestConnectionOnRefresh(tabId) {
  console.log(`Retesting connection for tab ${tabId} after page refresh`);

  // Check if we have DevTools open for this tab
  const devToolsTabs = [];
  
  // For Firefox, this is different from Chrome
  // We use a message passing approach
  browser.runtime.sendMessage({
    type: "CONNECTION_STATUS_UPDATE",
    tabId: tabId,
    isConnected: false, // We'll update this shortly
  });

  // Get the settings
  const result = await browser.storage.local.get(["browserConnectorSettings"]);
  const settings = result.browserConnectorSettings || {
    serverHost: "localhost",
    serverPort: 3025,
  };

  // Test connection
  const isConnected = await validateServerIdentity(
    settings.serverHost,
    settings.serverPort
  );

  // Update status
  browser.runtime.sendMessage({
    type: "CONNECTION_STATUS_UPDATE",
    tabId: tabId,
    isConnected: isConnected,
  });

  if (!isConnected) {
    console.log(
      "Connection test failed after page refresh, initiating auto-discovery..."
    );
  } else {
    console.log("Connection test successful after page refresh");
  }
}

// Function to capture and send screenshot
function captureAndSendScreenshot(message, settings, sendResponse) {
  // Get the inspected window's tab
  browser.tabs.get(message.tabId)
    .then((tab) => {
      // Get all windows to find the one containing our tab
      browser.windows.getAll({ populate: true })
        .then((windows) => {
          const targetWindow = windows.find((w) =>
            w.tabs.some((t) => t.id === message.tabId)
          );

          if (!targetWindow) {
            console.error("Could not find window containing the inspected tab");
            sendResponse({
              success: false,
              error: "Could not find window containing the inspected tab",
            });
            return;
          }

          // Capture screenshot of the window containing our tab
          browser.tabs.captureTab(message.tabId, { format: "png" })
            .then((dataUrl) => {
              // Send screenshot data to browser connector using configured settings
              const serverUrl = `http://${settings.serverHost}:${settings.serverPort}/screenshot`;
              console.log(`Sending screenshot to ${serverUrl}`);

              fetch(serverUrl, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  data: dataUrl,
                  path: message.screenshotPath,
                }),
              })
                .then((response) => response.json())
                .then((result) => {
                  if (result.error) {
                    console.error("Error from server:", result.error);
                    sendResponse({ success: false, error: result.error });
                  } else {
                    console.log("Screenshot saved successfully:", result.path);
                    // Send success response
                    sendResponse({
                      success: true,
                      path: result.path,
                      title: tab.title || "Current Tab",
                    });
                  }
                })
                .catch((error) => {
                  console.error("Error sending screenshot data:", error);
                  sendResponse({
                    success: false,
                    error: error.message || "Failed to save screenshot",
                  });
                });
            })
            .catch((error) => {
              console.error("Error capturing screenshot:", error);
              sendResponse({
                success: false,
                error: error.message || "Failed to capture screenshot",
              });
            });
        })
        .catch((error) => {
          console.error("Error getting windows:", error);
          sendResponse({
            success: false,
            error: error.message || "Failed to get windows",
          });
        });
    })
    .catch((error) => {
      console.error("Error getting tab:", error);
      sendResponse({
        success: false,
        error: error.message || "Failed to get tab",
      });
    });
}

// Function to update the server with the current URL
async function updateServerWithUrl(tabId, url, source = "background_update") {
  try {
    // Get the server settings
    const result = await browser.storage.local.get(["browserConnectorSettings"]);
    const settings = result.browserConnectorSettings || {
      serverHost: "localhost",
      serverPort: 3025,
    };

    // First, validate that we're talking to the right server
    const isValid = await validateServerIdentity(
      settings.serverHost,
      settings.serverPort
    );

    if (!isValid) {
      console.log("Skipping URL update: not connected to a valid server");
      return;
    }

    // Send the URL update
    console.log(
      `Sending URL update for tab ${tabId} to ${settings.serverHost}:${settings.serverPort}`
    );

    const response = await fetch(
      `http://${settings.serverHost}:${settings.serverPort}/current-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: url,
          tabId: tabId,
          source: source,
          timestamp: Date.now(),
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    console.log("URL update response:", data);
  } catch (error) {
    console.error("Error updating server with URL:", error);
  }
}

// Funzione per acquisire uno screenshot
function captureScreenshot(tabId) {
  return new Promise((resolve, reject) => {
    try {
      browser.tabs.captureVisibleTab(null, { format: 'png' })
        .then(dataUrl => {
          resolve(dataUrl);
        })
        .catch(error => {
          reject(error);
        });
    } catch (error) {
      reject(error);
    }
  });
}

// Gestione comando da tastiera
browser.commands.onCommand.addListener((command) => {
  if (command === "open-popup") {
    browser.browserAction.openPopup();
  }
}); 