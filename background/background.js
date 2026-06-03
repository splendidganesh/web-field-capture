console.log('Background service worker loaded');

// Keep service worker alive
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extension installed');
});

// Message passing between content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Background received message:', message);
    
    if (message.type === 'FIELD_CAPTURED') {
        // Store the captured field
        chrome.storage.local.get(['capturedFields'], (result) => {
            let fields = result.capturedFields || [];
            fields.push(message.data);
            chrome.storage.local.set({ capturedFields: fields }, () => {
                console.log('Field saved:', message.data);
            });
        });
    } else if (message.type === 'STORE_TEST') {
        // message: { name, data }
        chrome.storage.local.get(['savedTests'], (result) => {
            const saved = result.savedTests || [];
            // replace if exists
            const idx = saved.findIndex(t => t.name === message.name);
            const item = { name: message.name, data: message.data, timestamp: new Date().toISOString() };
            if (idx >= 0) saved[idx] = item; else saved.push(item);
            chrome.storage.local.set({ savedTests: saved }, () => {
                console.log('Test saved:', message.name);
                sendResponse && sendResponse({ ok: true });
            });
        });
        // indicate we'll respond asynchronously
        return true;
    } else if (message.type === 'GET_TESTS') {
        chrome.storage.local.get(['savedTests'], (result) => {
            sendResponse && sendResponse({ tests: result.savedTests || [] });
        });
        return true;
    } else if (message.type === 'RUN_STORED') {
        // message: { name }
        chrome.storage.local.get(['savedTests'], async (result) => {
            const saved = result.savedTests || [];
            const item = saved.find(t => t.name === message.name);
            if (!item) {
                sendResponse && sendResponse({ ok: false, error: 'not found' });
                return;
            }

            // send RUN_CAPTURE to active tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tabs && tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { type: 'RUN_CAPTURE', data: item.data }, (resp) => {
                    sendResponse && sendResponse({ ok: true, forwarded: !!resp });
                });
            } else {
                sendResponse && sendResponse({ ok: false, error: 'no active tab' });
            }
        });
        return true;
    }
    
    sendResponse({ received: true });
    return true;
});