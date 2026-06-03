function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function convertToPythonSelector(selector) {
    return selector.replace(/"/g, '\\"');
}

function convertToJavaSelector(selector) {
    return selector.replace(/"/g, '\\"');
}

function escapeString(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '\\"').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        escapeHtml,
        sanitizeFilename,
        convertToPythonSelector,
        convertToJavaSelector,
        escapeString
    };
}
