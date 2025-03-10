const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld("electronAPI", {
    onDataReceived: callback => ipcRenderer.on("data-received", (evt, data) => callback(data)),
    generateBarcode: data => ipcRenderer.send("generate-barcode", data),
    printContent: content => ipcRenderer.send("print-content", content),
    printReport: html => ipcRenderer.send(`print-report`, html),
    drawCash: () => ipcRenderer.send(`draw-cash`, null),
    updateCustomerDisplay: content => ipcRenderer.send(`update-display`, content),
    reloadWindow: content => ipcRenderer.send('reload', content),
    getPrinters: () => ipcRenderer.invoke("get-printers"),
    closeApp: () => ipcRenderer.send("close-window"),
    relaunch: () => ipcRenderer.send("relaunch"),
});