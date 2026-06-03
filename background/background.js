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
    }
    
    sendResponse({ received: true });
    return true;
});