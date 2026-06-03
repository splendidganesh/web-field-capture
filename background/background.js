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
        chrome.storage.local.get(['savedTests'], (result) => {
            const saved = result.savedTests || [];
            const item = saved.find(t => t.name === message.name);
            if (!item) {
                sendResponse && sendResponse({ ok: false, error: 'not found' });
                return;
            }

            // send RUN_CAPTURE to active tab, injecting content script first
            chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
                if (!tabs || !tabs[0]) {
                    sendResponse && sendResponse({ ok: false, error: 'no active tab' });
                    return;
                }
                const tabId = tabs[0].id;
                // Try to inject content script, then forward the run message
                try {
                    chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] }).then(() => {
                        chrome.tabs.sendMessage(tabId, { type: 'RUN_CAPTURE', data: item.data }, (resp) => {
                            sendResponse && sendResponse({ ok: true, forwarded: !!resp });
                        });
                    }).catch(err => {
                        // Even if injection fails, attempt to send the message
                        chrome.tabs.sendMessage(tabId, { type: 'RUN_CAPTURE', data: item.data }, (resp) => {
                            sendResponse && sendResponse({ ok: true, forwarded: !!resp, injectError: String(err) });
                        });
                    });
                } catch (e) {
                    // fallback: attempt to send the message
                    chrome.tabs.sendMessage(tabId, { type: 'RUN_CAPTURE', data: item.data }, (resp) => {
                        sendResponse && sendResponse({ ok: true, forwarded: !!resp, error: String(e) });
                    });
                }
            }).catch(err => {
                sendResponse && sendResponse({ ok: false, error: String(err) });
            });
        });
        return true;
    }
    
    sendResponse({ received: true });
    return true;
});