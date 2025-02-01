const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld("electronAPI", {
    onDataReceived: callback => ipcRenderer.on("data-received", (evt, data) => callback(data)),
    generateBarcode: data => ipcRenderer.send("generate-barcode", data),
    printContent: content => ipcRenderer.send("print-content", content),
    printReport: html => ipcRenderer.send(`print-report`, html),
    updateCustomerDisplay: content => ipcRenderer.send(`update-display`, content)
});