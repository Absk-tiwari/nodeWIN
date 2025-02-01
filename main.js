const electron = require('electron')
const { app, BrowserWindow, screen } = require('electron');
const path = require('path');
const bwipjs = require('bwip-js');
const server = require('./backend/server');
const { ipcMain } = require("electron");

ipcMain.on("print-content", (event, content) => {

    const printWindow = new BrowserWindow({ 
        show: false,
        width: 640,
        height: 480
    });
    const html = `
    <html>
        <body style="margin: 0; display: flex; justify-content: center; align-items: center; height: 100%;">
        <img src="${content}" style="max-width: 100%; max-height: 100%;" />
        </body>
    </html>`
    printWindow.loadURL(`data:text/html,<div>${html}</div>`);

    printWindow.webContents.on("did-finish-load", () => {
        printWindow.webContents.print({silent:true}, (success, error) => {
            if (!success || error) { 
                if (error) {
                    console.error('Error writing to file:', error);
                }
            };
            printWindow.close();
        });
    }); 

});

ipcMain.on(`print-report`, async(event, html) => {
    try {
        const printWin = new BrowserWindow({ show:false });
        printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        printWin.webContents.on("did-finish-load", () => {
            printWin.webContents.print(
                { silent: true, printBackground: true },
                (success, errorType) => {
                    if (!success) console.error("Failed to print:", errorType);
                    printWin.close(); // Close the hidden window after printing
                }
            );
        });
    } catch (error) {
        console.log(error.message)
    }
})

ipcMain.on("generate-barcode", async (event, content)=> {
    try {
        const buffer = await bwipjs.toBuffer({
            bcid: "code128",
            text: content,
            scale: 2,
            height:10,
            includetext:true,
            textxalign:'center',
            textyalign:'center'
        });
        const printWindow = new BrowserWindow({ show: false }); // Hidden window
        const barcodeHTML = `
        <html>
            <body>
                <img src="data:image/png;base64,${buffer.toString("base64")}" style="width:100vw;height:100vh;" />
            </body>
        </html>
        `;
        printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(barcodeHTML)}`);
        // Wait for the content to load, then print
        printWindow.webContents.on("did-finish-load", () => {
            printWindow.webContents.print(
                { silent: true, printBackground: true, pageSize: {width: 640,height: 480} },
                (success, errorType) => {
                if (!success) console.error("Failed to print:", errorType);
                printWindow.close(); // Close the hidden window after printing
                }
            );
        });
    } catch (error) {
        console.log(error.message)
    }
})

let mainWindow;
let backendProcess;

app.on('ready', () => {
    server.start();

    const {
        width,
        height
    } = electron.screen.getPrimaryDisplay().workAreaSize
 
    mainWindow = new BrowserWindow({
        width,
        height,
        devTools:false,
        autoHideMenuBar: true,
        scrollBounce:true,
        // fullscreen: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: true, // Prevent direct access to Node.js in the renderer
            preload: path.join(__dirname, 'preload.js'),
        },
    });
    // Load the React app from the backend
    mainWindow.loadURL('http://localhost:5100');

    mainWindow.webContents.once('did-finish-load', function () {
        mainWindow.show()
        mainWindow.maximize();
    });
    // Handle window close
    mainWindow.on('closed', () => {
        mainWindow = null;
        if (backendProcess) backendProcess.kill();
    });


    // Here goes the customer-display

    const displays = screen.getAllDisplays();
    const customerDisplay = displays.length > 1 ? displays[1] : null;

    if (customerDisplay) {

        console.log("Customer display found: ", customerDisplay );
        const customerWindow = new BrowserWindow({
            width: customerDisplay.size.width,
            height: customerDisplay.size.height,
            x: customerDisplay.bounds.x,
            y: customerDisplay.bounds.y,
            frame: false, // Optional: Hide the window frame for a cleaner look
            fullscreen: true, // Optional: Make it fullscreen on the display
            alwaysOnTop: true, // Optional: Keep it on top
            webPreferences: {
                nodeIntegration: true,
            },
        });

        // Load the content to display on the customer screen
        customerWindow.loadFile("http://localhost:5100/#/pos/customer");

    } else {
        console.log("No secondary display detected.");
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
