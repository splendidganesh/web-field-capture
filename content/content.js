console.log('Content script loaded');

let capturing = false;

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Content script received:', message);
    
    if (message.type === 'START_CAPTURE') {
        startCapture();
        sendResponse({ status: 'started' });
    } else if (message.type === 'STOP_CAPTURE') {
        stopCapture();
        sendResponse({ status: 'stopped' });
    }
    
    return true;
});

function startCapture() {
    if (capturing) return;
    
    capturing = true;
    console.log('Capture started');
    
    // Show indicator
    showIndicator();
    
    // Add event listeners
    document.addEventListener('click', handleClick, true);
    document.addEventListener('input', handleInput, true);
    document.addEventListener('mouseover', handleHover, true);
    document.addEventListener('mouseout', handleOut, true);

    // Also perform an initial scan and capture of all interactive elements on the page
    // This enables "open URL and auto-capture all fields/buttons" behavior
    try {
        scanAndCaptureAll();
    } catch (e) {
        console.error('Auto-scan capture failed:', e);
    }
}

function stopCapture() {
    if (!capturing) return;
    
    capturing = false;
    console.log('Capture stopped');
    
    // Remove indicator
    removeIndicator();
    
    // Remove event listeners
    document.removeEventListener('click', handleClick, true);
    document.removeEventListener('input', handleInput, true);
    document.removeEventListener('mouseover', handleHover, true);
    document.removeEventListener('mouseout', handleOut, true);
    
    // Remove highlights
    document.querySelectorAll('.fc-highlight').forEach(el => {
        el.classList.remove('fc-highlight');
    });
}

function handleClick(e) {
    if (!capturing) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const element = e.target;
    captureElement(element, 'click');
}

function handleInput(e) {
    if (!capturing) return;
    
    const element = e.target;
    captureElement(element, 'input', e.target.value);
}

function handleHover(e) {
    if (!capturing) return;
    
    const element = e.target;
    if (isInteractive(element)) {
        element.classList.add('fc-highlight');
    }
}

function handleOut(e) {
    if (!capturing) return;
    
    e.target.classList.remove('fc-highlight');
}

function isInteractive(element) {
    const tag = element.tagName.toLowerCase();
    return ['input', 'button', 'select', 'textarea', 'a'].includes(tag);
}

function captureElement(element, action, value) {
    const data = {
        tagName: element.tagName,
        type: element.type || '',
        id: element.id || '',
        name: element.name || '',
        selector: getSelector(element),
        value: value || element.value || '',
        action: action,
        timestamp: new Date().toISOString()
    };
    
    console.log('Captured:', data);
    
    // Flash effect
    element.classList.add('fc-captured');
    setTimeout(() => element.classList.remove('fc-captured'), 500);
    
    // Send to background
    chrome.runtime.sendMessage({
        type: 'FIELD_CAPTURED',
        data: data
    });
}

// Scan the page for interactive fields and capture them automatically
function scanAndCaptureAll() {
    const selectors = 'input, textarea, select, button, a';
    const nodes = Array.from(document.querySelectorAll(selectors));

    nodes.forEach(el => {
        // Ignore script/style or hidden elements
        try {
            const style = window.getComputedStyle(el);
            if (style && (style.display === 'none' || style.visibility === 'hidden' || el.offsetParent === null)) return;
        } catch (e) {
            // ignore
        }

        const tag = el.tagName.toLowerCase();

        if (tag === 'input') {
            const t = (el.type || '').toLowerCase();
            // capture text-like inputs only
            const textTypes = ['text','email','password','search','tel','url','number'];
            if (textTypes.includes(t) || t === '' ) {
                captureElement(el, 'input', el.value || '');
            } else if (t === 'checkbox' || t === 'radio') {
                captureElement(el, 'input', el.checked);
            } else {
                // for other input types (button/file etc) capture as click
                captureElement(el, 'click');
            }
        } else if (tag === 'textarea') {
            captureElement(el, 'input', el.value || '');
        } else if (tag === 'select') {
            captureElement(el, 'select', el.value || '');
        } else if (tag === 'button' || (tag === 'a' && el.hasAttribute('href'))) {
            captureElement(el, 'click');
        }
    });
}

function getSelector(element) {
    if (element.id) {
        return `#${element.id}`;
    }
    
    if (element.name) {
        return `[name="${element.name}"]`;
    }
    
    // Simple path
    let path = element.tagName.toLowerCase();
    if (element.className) {
        path += '.' + element.className.split(' ')[0];
    }
    
    return path;
}

function showIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'fc-indicator';
    indicator.innerHTML = '🔴 Capturing Fields...';
    document.body.appendChild(indicator);
}

function removeIndicator() {
    const indicator = document.getElementById('fc-indicator');
    if (indicator) {
        indicator.remove();
    }
}