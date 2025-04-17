// Impostazioni dell'estensione
const settings = {
  logLimit: 100, // Numero massimo di log da visualizzare
  queryLimit: 100, // Numero massimo di query da visualizzare
  stringSizeLimit: 500,
  showRequestHeaders: false,
  showResponseHeaders: false,
  maxLogSize: 20000,
  screenshotPath: "",
  // Add server connection settings
  serverHost: '100.65.170.44', // Host del server
  serverPort: 3025, // Porta del server
  allowAutoPaste: false, // Default auto-paste setting
  autoDiscoveryPorts: [3025, 3026, 3027, 3028, 3029, 3030] // Portes da controllare durante l'auto-discovery
};

// Stato della connessione
let isConnected = false;
let socket = null;
let reconnectTimer = null;
let reconnectAttempts = 0;
let autoDiscoveryInProgress = false;

// Elementi UI
let connectionBanner = null;
let allButtons = [];

// Track connection status
let serverConnected = false;
let isDiscoveryInProgress = false;
let currentDiscoveryAttempt = 0;
let discoveryTimeoutId = null;

// Elementi dell'interfaccia utente
let connectionStatus;
let reconnectButton;
let discoverySpinner;

// Load saved settings on startup
browser.storage.local.get(["browserConnectorSettings"]).then((result) => {
  if (result.browserConnectorSettings) {
    settings = { ...settings, ...result.browserConnectorSettings };
    updateUIFromSettings();
  }

  // Create connection status banner at the top
  createConnectionBanner();

  // Automatically discover server on panel load with quiet mode enabled
  discoverServer(true);
});

// Add listener for connection status updates from background script (page refresh events)
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CONNECTION_STATUS_UPDATE") {
    console.log(
      `Received connection status update: ${
        message.isConnected ? "Connected" : "Disconnected"
      }`
    );

    // Update UI based on connection status
    if (message.isConnected) {
      // If already connected, just maintain the current state
      if (!serverConnected) {
        // Connection was re-established, update UI
        serverConnected = true;
        updateConnectionBanner(true, {
          name: "Browser Tools Server",
          version: "reconnected",
          host: settings.serverHost,
          port: settings.serverPort,
        });
      }
    } else {
      // Connection lost, update UI to show disconnected
      serverConnected = false;
      updateConnectionBanner(false, null);
    }
  }

  if (message.type === "INITIATE_AUTO_DISCOVERY") {
    console.log(
      `Initiating auto-discovery after page refresh (reason: ${message.reason})`
    );

    // For page refreshes or if forceRestart is set to true, always cancel any ongoing discovery and restart
    if (message.reason === "page_refresh" || message.forceRestart === true) {
      // Cancel any ongoing discovery operation
      cancelOngoingDiscovery();

      // Update UI to indicate we're starting a fresh scan
      if (connectionStatusDiv) {
        connectionStatusDiv.style.display = "block";
        if (statusIcon) statusIcon.className = "status-indicator";
        if (statusText)
          statusText.textContent =
            "Page refreshed. Restarting server discovery...";
      }

      // Always update the connection banner when a page refresh occurs
      updateConnectionBanner(false, null);

      // Start a new discovery process with quiet mode
      console.log("Starting fresh discovery after page refresh");
      discoverServer(true);
    }
    // For other types of auto-discovery requests, only start if not already in progress
    else if (!isDiscoveryInProgress) {
      // Use quiet mode for auto-discovery to minimize UI changes
      discoverServer(true);
    }
  }

  // Handle successful server validation
  if (message.type === "SERVER_VALIDATION_SUCCESS") {
    console.log(
      `Server validation successful: ${message.serverHost}:${message.serverPort}`
    );

    // Update the connection status banner
    serverConnected = true;
    updateConnectionBanner(true, message.serverInfo);

    // If we were showing the connection status dialog, we can hide it now
    if (connectionStatusDiv && connectionStatusDiv.style.display === "block") {
      connectionStatusDiv.style.display = "none";
    }
  }

  // Handle failed server validation
  if (message.type === "SERVER_VALIDATION_FAILED") {
    console.log(
      `Server validation failed: ${message.reason} - ${message.serverHost}:${message.serverPort}`
    );

    // Update the connection status
    serverConnected = false;
    updateConnectionBanner(false, null);

    // Start auto-discovery if this was a page refresh validation
    if (
      message.reason === "connection_error" ||
      message.reason === "http_error"
    ) {
      // If we're not already trying to discover the server, start the process
      if (!isDiscoveryInProgress) {
        console.log("Starting auto-discovery after validation failure");
        discoverServer(true);
      }
    }
  }

  // Handle successful WebSocket connection
  if (message.type === "WEBSOCKET_CONNECTED") {
    console.log(
      `WebSocket connected to ${message.serverHost}:${message.serverPort}`
    );

    // Update connection status if it wasn't already connected
    if (!serverConnected) {
      serverConnected = true;
      updateConnectionBanner(true, {
        name: "Browser Tools Server",
        version: "connected via WebSocket",
        host: message.serverHost,
        port: message.serverPort,
      });
    }
  }
});

// Create connection status banner
function createConnectionBanner() {
  // Check if banner already exists
  if (document.getElementById("connection-banner")) {
    return;
  }

  // Create the banner
  const banner = document.createElement("div");
  banner.id = "connection-banner";
  banner.style.cssText = `
    padding: 6px 0px; 
    margin-bottom: 4px;
    width: 40%; 
    display: flex; 
    flex-direction: column;
    align-items: flex-start; 
    background-color:rgba(0,0,0,0);
    border-radius: 11px;
    font-size: 11px;
    font-weight: 500;
    color: #ffffff;
  `;

  // Create reconnect button (now placed at the top)
  const reconnectButton = document.createElement("button");
  reconnectButton.id = "banner-reconnect-btn";
  reconnectButton.textContent = "Reconnect";
  reconnectButton.style.cssText = `
    background-color: #333333;
    color: #ffffff;
    border: 1px solid #444444;
    border-radius: 3px;
    padding: 2px 8px;
    font-size: 10px;
    cursor: pointer;
    margin-bottom: 6px;
    align-self: flex-start;
    display: none;
    transition: background-color 0.2s;
  `;
  reconnectButton.addEventListener("mouseover", () => {
    reconnectButton.style.backgroundColor = "#444444";
  });
  reconnectButton.addEventListener("mouseout", () => {
    reconnectButton.style.backgroundColor = "#333333";
  });
  reconnectButton.addEventListener("click", () => {
    // Cancel any ongoing discovery
    cancelOngoingDiscovery();
    // Restart discovery process
    discoverServer();
  });
  banner.appendChild(reconnectButton);

  // Create status text container
  const statusText = document.createElement("div");
  statusText.id = "connection-status-text";
  statusText.style.cssText = `
    display: flex;
    align-items: center;
    margin-bottom: 3px;
  `;

  // Create status indicator
  const statusIndicator = document.createElement("div");
  statusIndicator.id = "connection-status-indicator";
  statusIndicator.style.cssText = `
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 6px;
    background-color: #777777;
  `;
  statusText.appendChild(statusIndicator);

  // Create status message
  const statusMessage = document.createElement("span");
  statusMessage.id = "connection-status-message";
  statusMessage.textContent = "Disconnected";
  statusText.appendChild(statusMessage);

  banner.appendChild(statusText);

  // Create server info
  const serverInfo = document.createElement("div");
  serverInfo.id = "server-info";
  serverInfo.style.cssText = `
    display: none;
    margin-left: 14px;
    margin-bottom: 3px;
    font-size: 10px;
    color: #aaaaaa;
  `;
  banner.appendChild(serverInfo);

  // Create host info
  const hostInfo = document.createElement("div");
  hostInfo.id = "host-info";
  hostInfo.style.cssText = `
    display: none;
    margin-left: 14px;
    font-size: 10px;
    color: #aaaaaa;
  `;
  banner.appendChild(hostInfo);

  // Append the banner to the top of the page
  const body = document.querySelector("body");
  if (body && body.firstChild) {
    body.insertBefore(banner, body.firstChild);
  } else if (body) {
    body.appendChild(banner);
  }

  // Check connection when the banner is created
  if (settings.serverHost && settings.serverPort) {
    testConnection(settings.serverHost, settings.serverPort);
  }
}

// Update connection banner based on connection status
function updateConnectionBanner(connected, serverInfo) {
  const banner = document.getElementById("connection-banner");
  const indicator = document.getElementById("connection-status-indicator");
  const message = document.getElementById("connection-status-message");
  const serverInfoDiv = document.getElementById("server-info");
  const hostInfoDiv = document.getElementById("host-info");
  const reconnectBtn = document.getElementById("banner-reconnect-btn");

  if (!banner || !indicator || !message || !serverInfoDiv || !hostInfoDiv) {
    return;
  }

  if (connected) {
    indicator.style.backgroundColor = "#4CAF50"; // Green
    message.textContent = "Connected";
    reconnectBtn.style.display = "none";

    // Show server info if available
    if (serverInfo) {
      serverInfoDiv.style.display = "block";
      serverInfoDiv.textContent = `${serverInfo.name} ${serverInfo.version || ""}`;

      hostInfoDiv.style.display = "block";
      hostInfoDiv.textContent = `${serverInfo.host}:${serverInfo.port}`;
    }
  } else {
    indicator.style.backgroundColor = "#F44336"; // Red
    message.textContent = "Disconnected";
    reconnectBtn.style.display = "block";

    // Hide server info
    serverInfoDiv.style.display = "none";
    hostInfoDiv.style.display = "none";

    // Schedule a reconnect attempt
    scheduleReconnectAttempt();
  }
}

// Update UI elements based on current settings
function updateUIFromSettings() {
  // Update server connection settings
  if (document.getElementById("server-host")) {
    document.getElementById("server-host").value = settings.serverHost;
  }
  if (document.getElementById("server-port")) {
    document.getElementById("server-port").value = settings.serverPort;
  }

  // Screenshot path
  if (document.getElementById("screenshot-path")) {
    document.getElementById("screenshot-path").value = settings.screenshotPath;
  }
}

// Save settings to storage
function saveSettings() {
  // Get values from UI elements
  if (document.getElementById("server-host")) {
    settings.serverHost = document.getElementById("server-host").value;
  }
  if (document.getElementById("server-port")) {
    settings.serverPort = document.getElementById("server-port").value;
  }

  // Screenshot path
  if (document.getElementById("screenshot-path")) {
    settings.screenshotPath = document.getElementById("screenshot-path").value;
  }

  // Other settings can be added here

  // Save to storage
  browser.storage.local.set({
    browserConnectorSettings: settings,
  }).then(() => {
    console.log("Settings saved successfully");

    // Test connection with new settings if provided
    if (settings.serverHost && settings.serverPort) {
      testConnection(settings.serverHost, settings.serverPort);
    }
  });
}

// Helper function to abort any ongoing discovery operations
function cancelOngoingDiscovery() {
  // Cancel with the abort controller if it exists
  if (discoveryController) {
    console.log("Cancelling in-progress discovery operation");
    discoveryController.abort();
    discoveryController = null;
  }

  // Clear timeout if it exists
  if (reconnectAttemptTimeout) {
    console.log("Clearing scheduled reconnect attempt");
    clearTimeout(reconnectAttemptTimeout);
    reconnectAttemptTimeout = null;
  }

  // Reset discovery flag
  isDiscoveryInProgress = false;
}

// Test connection to server
async function testConnection(host, port) {
  try {
    console.log(`Testing connection to ${host}:${port}`);

    // Update UI to indicate connecting state
    const indicator = document.getElementById("connection-status-indicator");
    const message = document.getElementById("connection-status-message");
    if (indicator && message) {
      indicator.style.backgroundColor = "#FFC107"; // Yellow for connecting
      message.textContent = "Connecting...";
    }

    const response = await fetch(`http://${host}:${port}/.identity`, {
      method: "GET",
      timeout: 2000, // Use timeout option for Firefox
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();

    // Validate the server signature
    if (data.signature !== "mcp-browser-connector-24x7") {
      console.error("Invalid server signature - not the browser tools server");
      serverConnected = false;
      updateConnectionBanner(false, null);
      return false;
    }

    console.log("Connected to server:", data);
    serverConnected = true;
    updateConnectionBanner(true, {
      name: data.name || "Browser Tools Server",
      version: data.version || "",
      host: host,
      port: port,
    });

    // Send URL update to server after successful connection
    const tabId = await getCurrentTabId();
    if (tabId) {
      const url = await getCurrentTabUrl(tabId);
      if (url) {
        browser.runtime.sendMessage({
          type: "UPDATE_SERVER_URL",
          tabId: tabId,
          url: url,
          source: "initial_connection",
        });
      }
    }

    return true;
  } catch (error) {
    console.error("Connection test failed:", error);
    serverConnected = false;
    updateConnectionBanner(false, null);
    return false;
  }
}

// Schedule a reconnect attempt
function scheduleReconnectAttempt() {
  if (reconnectAttemptTimeout) {
    clearTimeout(reconnectAttemptTimeout);
  }

  console.log("Scheduling reconnect attempt in 10 seconds");
  reconnectAttemptTimeout = setTimeout(() => {
    if (!serverConnected && !isDiscoveryInProgress) {
      console.log("Attempting to reconnect to server");
      discoverServer(true);
    }
  }, 10000);
}

// Attempt to connect to a specific server
async function tryServerConnection(host, port) {
  try {
    console.log(`Trying server at ${host}:${port}`);

    const controller = new AbortController();
    const signal = controller.signal;

    // Add this controller to the global state so it can be cancelled
    discoveryController = controller;

    const response = await fetch(`http://${host}:${port}/.identity`, {
      method: "GET",
      signal: signal,
      timeout: 1000, // Use timeout option for Firefox
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const data = await response.json();

    // Validate the server signature
    if (data.signature !== "mcp-browser-connector-24x7") {
      console.error("Invalid server signature - not the browser tools server");
      return false;
    }

    console.log("Connected to server:", data);

    // Update connection settings with discovered server
    settings.serverHost = host;
    settings.serverPort = port;

    // Save the settings to storage
    browser.storage.local.set({
      browserConnectorSettings: settings,
    }).then(() => {
      console.log("Updated settings with discovered server");
      // Update UI from settings
      updateUIFromSettings();
    });

    // Update the connection banner
    serverConnected = true;
    updateConnectionBanner(true, {
      name: data.name || "Browser Tools Server",
      version: data.version || "",
      host: host,
      port: port,
    });

    // Send URL update to server after successful connection
    const tabId = await getCurrentTabId();
    if (tabId) {
      browser.runtime.sendMessage({
        type: "UPDATE_SERVER_URL",
        tabId: tabId,
        url: await getCurrentTabUrl(tabId),
        source: "auto_discovery",
      });
    }

    return true;
  } catch (error) {
    // If the request was aborted, log it but don't treat as an error
    if (error && error.name === "AbortError") {
      console.log(`Connection attempt to ${host}:${port} was aborted`);
    } else {
      console.log(`Connection attempt to ${host}:${port} failed:`, error);
    }
    return false;
  }
}

// Helper function to get the current tab ID
async function getCurrentTabId() {
  const devtools = browser.devtools.inspectedWindow;
  if (devtools && devtools.tabId) {
    return devtools.tabId;
  }
  return null;
}

// Helper function to get the URL of the current tab
async function getCurrentTabUrl(tabId) {
  try {
    const response = await browser.runtime.sendMessage({
      type: "GET_CURRENT_URL",
      tabId: tabId,
    });
    
    if (response && response.success && response.url) {
      return response.url;
    }
    return null;
  } catch (error) {
    console.error("Error getting tab URL:", error);
    return null;
  }
}

// Automatically discover the browser tools server
async function discoverServer(quietMode = false) {
  // Don't start discovery if already in progress
  if (isDiscoveryInProgress) {
    console.log("Discovery already in progress, ignoring request");
    return;
  }

  console.log("Starting server discovery");
  isDiscoveryInProgress = true;

  // Abort any existing discovery controller
  if (discoveryController) {
    discoveryController.abort();
  }

  // Create a new abort controller
  discoveryController = new AbortController();

  // Show searching status in UI if not in quiet mode
  if (!quietMode) {
    const indicator = document.getElementById("connection-status-indicator");
    const message = document.getElementById("connection-status-message");
    if (indicator && message) {
      indicator.style.backgroundColor = "#FFC107"; // Yellow for searching
      message.textContent = "Searching for server...";
    }
  }

  try {
    // First try the current configured server
    if (settings.serverHost && settings.serverPort) {
      console.log(`Trying configured server: ${settings.serverHost}:${settings.serverPort}`);
      const success = await tryServerConnection(
        settings.serverHost,
        settings.serverPort
      );
      if (success) {
        console.log("Connected to configured server");
        isDiscoveryInProgress = false;
        return;
      }
    }

    // Try common ports on localhost
    const commonPorts = [3025, 3000, 8000, 8080, 4000, 5000];
    for (const port of commonPorts) {
      // Skip the already tried configured port
      if (
        settings.serverHost === "localhost" &&
        parseInt(settings.serverPort) === port
      ) {
        continue;
      }

      console.log(`Trying localhost:${port}`);
      const success = await tryServerConnection("localhost", port);
      if (success) {
        console.log(`Connected to server on localhost:${port}`);
        isDiscoveryInProgress = false;
        return;
      }
    }

    // If we reach here, no server was found
    console.log("No server found during discovery");
    if (!quietMode) {
      updateConnectionBanner(false, null);
    }
  } catch (error) {
    console.error("Error during discovery:", error);
  } finally {
    isDiscoveryInProgress = false;
  }
}

// Configure event handlers when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Server connection settings
  const saveServerBtn = document.getElementById("save-server-btn");
  if (saveServerBtn) {
    saveServerBtn.addEventListener("click", saveSettings);
  }

  // Reconnect button
  const reconnectBtn = document.getElementById("reconnect-btn");
  if (reconnectBtn) {
    reconnectBtn.addEventListener("click", () => {
      // Cancel any ongoing discovery
      cancelOngoingDiscovery();
      // Start fresh discovery
      discoverServer();
    });
  }

  // Screenshot section settings
  const saveScreenshotBtn = document.getElementById("save-screenshot-btn");
  if (saveScreenshotBtn) {
    saveScreenshotBtn.addEventListener("click", saveSettings);
  }

  // Screenshot capture button
  const captureBtn = document.getElementById("capture-btn");
  if (captureBtn) {
    captureBtn.addEventListener("click", captureScreenshot);
  }

  // Network logs button
  const getNetworkLogsBtn = document.getElementById("get-network-logs-btn");
  if (getNetworkLogsBtn) {
    getNetworkLogsBtn.addEventListener("click", getNetworkLogs);
  }

  // Network error logs button
  const getNetworkErrorsBtn = document.getElementById("get-network-errors-btn");
  if (getNetworkErrorsBtn) {
    getNetworkErrorsBtn.addEventListener("click", getNetworkErrors);
  }

  // Console logs button
  const getConsoleLogsBtn = document.getElementById("get-console-logs-btn");
  if (getConsoleLogsBtn) {
    getConsoleLogsBtn.addEventListener("click", getConsoleLogs);
  }

  // Console error logs button
  const getConsoleErrorsBtn = document.getElementById("get-console-errors-btn");
  if (getConsoleErrorsBtn) {
    getConsoleErrorsBtn.addEventListener("click", getConsoleErrors);
  }

  // Wipe logs button
  const wipeLogsBtn = document.getElementById("wipe-logs-btn");
  if (wipeLogsBtn) {
    wipeLogsBtn.addEventListener("click", wipeLogs);
  }

  // Selected element button
  const getSelectedElementBtn = document.getElementById("get-element-btn");
  if (getSelectedElementBtn) {
    getSelectedElementBtn.addEventListener("click", getSelectedElement);
  }

  // Element Audit buttons
  const runAccessibilityAuditBtn = document.getElementById("run-a11y-audit-btn");
  if (runAccessibilityAuditBtn) {
    runAccessibilityAuditBtn.addEventListener("click", runAccessibilityAudit);
  }

  const runPerformanceAuditBtn = document.getElementById("run-perf-audit-btn");
  if (runPerformanceAuditBtn) {
    runPerformanceAuditBtn.addEventListener("click", runPerformanceAudit);
  }

  const runSEOAuditBtn = document.getElementById("run-seo-audit-btn");
  if (runSEOAuditBtn) {
    runSEOAuditBtn.addEventListener("click", runSEOAudit);
  }

  const runBestPracticesBtn = document.getElementById("run-best-practices-btn");
  if (runBestPracticesBtn) {
    runBestPracticesBtn.addEventListener("click", runBestPracticesAudit);
  }

  const runNextJSAuditBtn = document.getElementById("run-nextjs-audit-btn");
  if (runNextJSAuditBtn) {
    runNextJSAuditBtn.addEventListener("click", runNextJSAudit);
  }

  // Mode buttons
  const runDebuggerModeBtn = document.getElementById("run-debugger-mode-btn");
  if (runDebuggerModeBtn) {
    runDebuggerModeBtn.addEventListener("click", runDebuggerMode);
  }

  const runAuditModeBtn = document.getElementById("run-audit-mode-btn");
  if (runAuditModeBtn) {
    runAuditModeBtn.addEventListener("click", runAuditMode);
  }
});

// Capture screenshot function
async function captureScreenshot() {
  const screenshotPath = document.getElementById("screenshot-path").value || "";
  
  // Get the inspected tab ID
  const tabId = await getCurrentTabId();
  if (!tabId) {
    console.error("Could not get the current tab ID");
    return;
  }

  // Show a status indicator
  const statusDiv = document.getElementById("screenshot-status");
  if (statusDiv) {
    statusDiv.textContent = "Capturing screenshot...";
    statusDiv.style.color = "#FFC107"; // Yellow
  }

  // Send capture request to background script
  browser.runtime.sendMessage({
    type: "CAPTURE_SCREENSHOT",
    tabId: tabId,
    screenshotPath: screenshotPath
  }, (response) => {
    console.log("Screenshot response:", response);
    if (statusDiv) {
      if (response && response.success) {
        statusDiv.textContent = `Saved to ${response.path}`;
        statusDiv.style.color = "#4CAF50"; // Green
      } else {
        statusDiv.textContent = `Error: ${response ? response.error : "Unknown error"}`;
        statusDiv.style.color = "#F44336"; // Red
      }
    }
  });
}

// Get network logs function
async function getNetworkLogs() {
  await executeInInspectedWindow("mcp_browser_tools_getNetworkLogs");
}

// Get network errors function
async function getNetworkErrors() {
  await executeInInspectedWindow("mcp_browser_tools_getNetworkErrors");
}

// Get console logs function
async function getConsoleLogs() {
  await executeInInspectedWindow("mcp_browser_tools_getConsoleLogs");
}

// Get console errors function
async function getConsoleErrors() {
  await executeInInspectedWindow("mcp_browser_tools_getConsoleErrors");
}

// Wipe logs function
async function wipeLogs() {
  await executeInInspectedWindow("mcp_browser_tools_wipeLogs");
}

// Get selected element function
async function getSelectedElement() {
  await executeInInspectedWindow("mcp_browser_tools_getSelectedElement");
}

// Run accessibility audit function
async function runAccessibilityAudit() {
  await executeInInspectedWindow("mcp_browser_tools_runAccessibilityAudit");
}

// Run performance audit function
async function runPerformanceAudit() {
  await executeInInspectedWindow("mcp_browser_tools_runPerformanceAudit");
}

// Run SEO audit function
async function runSEOAudit() {
  await executeInInspectedWindow("mcp_browser_tools_runSEOAudit");
}

// Run best practices audit function
async function runBestPracticesAudit() {
  await executeInInspectedWindow("mcp_browser_tools_runBestPracticesAudit");
}

// Run NextJS audit function
async function runNextJSAudit() {
  await executeInInspectedWindow("mcp_browser_tools_runNextJSAudit");
}

// Run debugger mode function
async function runDebuggerMode() {
  await executeInInspectedWindow("mcp_browser_tools_runDebuggerMode");
}

// Run audit mode function
async function runAuditMode() {
  await executeInInspectedWindow("mcp_browser_tools_runAuditMode");
}

// Helper function to execute code in the inspected window
async function executeInInspectedWindow(functionName, args = {}) {
  // For Firefox we need to use browser.devtools.inspectedWindow.eval
  const code = `
    async function executeFunction() {
      try {
        if (typeof ${functionName} === 'function') {
          const result = await ${functionName}(${JSON.stringify(args)});
          return { success: true, result };
        } else {
          return { success: false, error: "${functionName} is not defined" };
        }
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    executeFunction();
  `;

  try {
    await browser.devtools.inspectedWindow.eval(code, {
      useContentScriptContext: true
    });
    return { success: true };
  } catch (error) {
    console.error(`Error executing ${functionName}:`, error);
    return { success: false, error: error.message };
  }
} 