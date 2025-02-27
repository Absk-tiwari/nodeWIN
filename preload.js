const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld("electronAPI", {
    onDataReceived: callback => ipcRenderer.on("data-received", (evt, data) => callback(data)),
    generateBarcode: data => ipcRenderer.send("generate-barcode", data),
    printContent: content => ipcRenderer.send("print-content", content),
    printReport: html => ipcRenderer.send(`print-report`, html),
    drawCash: () => ipcRenderer.send(`draw-cash`, null),
    updateCustomerDisplay: content => ipcRenderer.send(`update-display`, content),
    reloadWindow: () => ipcRenderer.send('reload',null),
    getPrinters: () => ipcRenderer.invoke("get-printers"),
});