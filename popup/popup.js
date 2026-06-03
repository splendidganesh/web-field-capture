let capturedFields = [];
let isCapturing = false;

// DOM Elements
const startCaptureBtn = document.getElementById('startBtn');
const stopCaptureBtn = document.getElementById('stopBtn');
const clearCaptureBtn = document.getElementById('clearBtn');
const captureStatus = document.getElementById('status');
const fieldCount = document.getElementById('fieldCount');
const fieldsList = document.getElementById('fieldsList');
const exportBtn = document.getElementById('exportBtn');
const runBtn = document.getElementById('runBtn');
const saveBtn = document.getElementById('saveBtn');
const runStoredBtn = document.getElementById('runStoredBtn');
const testCaseNameInput = document.getElementById('testName');
const exportFormatSelect = document.getElementById('exportFormat');

// Load saved data on popup open
loadCapturedFields();

// Event Listeners
startCaptureBtn.addEventListener('click', startCapture);
stopCaptureBtn.addEventListener('click', stopCapture);
clearCaptureBtn.addEventListener('click', clearCapture);
exportBtn.addEventListener('click', exportTestCase);
runBtn && runBtn.addEventListener('click', runCapturedTest);
saveBtn && saveBtn.addEventListener('click', saveCurrentTest);
runStoredBtn && runStoredBtn.addEventListener('click', runStoredTestPrompt);

// Listen for captured fields from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'FIELD_CAPTURED') {
        addCapturedField(message.data);
        sendResponse({ success: true });
    } else if (message.type === 'RUN_COMPLETE') {
        // Replay finished in content script
        captureStatus.textContent = 'Inactive';
        isCapturing = false;
        updateUI();
        sendResponse({ ack: true });
    }
});

async function startCapture() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    // Inject content script if needed
    await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content/content.js']
    });

    // Send message to start capturing
    chrome.tabs.sendMessage(tab.id, { type: 'START_CAPTURE' });
    
    isCapturing = true;
    updateUI();
}

async function stopCapture() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: 'STOP_CAPTURE' });
    
    isCapturing = false;
    updateUI();
}

async function runCapturedTest() {
    if (capturedFields.length === 0) {
        alert('No captured fields to run');
        return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Ensure content script is injected before sending the replay message
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/content.js']
        });
    } catch (e) {
        console.warn('Could not inject content script (maybe already injected):', e);
    }

    // Instruct content script to replay the captured actions
    chrome.tabs.sendMessage(tab.id, { type: 'RUN_CAPTURE', data: capturedFields }, (resp) => {
        console.log('Run request sent', resp);
    });

    // Update UI to show running
    captureStatus.textContent = 'Replaying';
}

function clearCapture() {
    if (confirm('Are you sure you want to clear all captured fields?')) {
        capturedFields = [];
        saveCapturedFields();
        renderFieldsList();
        updateUI();
    }
}

function addCapturedField(fieldData) {
    const field = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        ...fieldData
    };
    
    capturedFields.push(field);
    saveCapturedFields();
    renderFieldsList();
    updateUI();
}

function deleteField(fieldId) {
    capturedFields = capturedFields.filter(f => f.id !== fieldId);
    saveCapturedFields();
    renderFieldsList();
    updateUI();
}

function renderFieldsList() {
    if (capturedFields.length === 0) {
        fieldsList.innerHTML = '<p class="empty-state">No fields captured yet. Click "Start Capture" and interact with the page.</p>';
        return;
    }

    fieldsList.innerHTML = capturedFields.map(field => `
        <div class="field-item">
            <div class="field-header">
                <span class="field-type">${field.tagName || field.type}</span>
                <span class="field-action">${field.action}</span>
            </div>
            <div class="field-detail">
                <strong>Element:</strong> ${field.selector}
            </div>
            ${field.id ? `<div class="field-detail"><strong>ID:</strong> ${field.id}</div>` : ''}
            ${field.name ? `<div class="field-detail"><strong>Name:</strong> ${field.name}</div>` : ''}
            ${field.value !== undefined ? `<div class="field-detail"><strong>Value:</strong> <span class="field-value">${escapeHtml(field.value)}</span></div>` : ''}
            ${field.placeholder ? `<div class="field-detail"><strong>Placeholder:</strong> ${field.placeholder}</div>` : ''}
            <button class="delete-field" onclick="deleteFieldById(${field.id})">×</button>
        </div>
    `).join('');
}

// Make delete function global
window.deleteFieldById = deleteField;

function updateUI() {
    if (isCapturing) {
        startCaptureBtn.disabled = true;
        stopCaptureBtn.disabled = false;
        captureStatus.textContent = 'Active';
        captureStatus.classList.remove('inactive');
        captureStatus.classList.add('active');
    } else {
        startCaptureBtn.disabled = false;
        stopCaptureBtn.disabled = true;
        captureStatus.textContent = 'Inactive';
        captureStatus.classList.remove('active');
        captureStatus.classList.add('inactive');
    }
    
    fieldCount.textContent = `${capturedFields.length} field${capturedFields.length !== 1 ? 's' : ''} captured`;
}

function saveCapturedFields() {
    chrome.storage.local.set({ capturedFields });
}

function loadCapturedFields() {
    chrome.storage.local.get(['capturedFields'], (result) => {
        capturedFields = result.capturedFields || [];
        renderFieldsList();
        updateUI();
    });
}

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

async function exportTestCase() {
    if (capturedFields.length === 0) {
        alert('No fields captured to export!');
        return;
    }

    const testCaseName = testCaseNameInput.value || 'Untitled Test Case';
    const format = exportFormatSelect.value;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const pageUrl = tab.url;
    const pageTitle = tab.title;

    const testData = {
        name: testCaseName,
        url: pageUrl,
        pageTitle: pageTitle,
        timestamp: new Date().toISOString(),
        fields: capturedFields
    };

    let content;
    let filename;
    let mimeType;

    switch (format) {
        case 'selenium-python':
            content = generateSeleniumPython(testData);
            filename = `${sanitizeFilename(testCaseName)}.py`;
            mimeType = 'text/x-python';
            break;
        case 'selenium-java':
            content = generateSeleniumJava(testData);
            filename = `${sanitizeFilename(testCaseName)}.java`;
            mimeType = 'text/x-java';
            break;
        case 'playwright':
            content = generatePlaywright(testData);
            filename = `${sanitizeFilename(testCaseName)}.spec.js`;
            mimeType = 'text/javascript';
            break;
        case 'cypress':
            content = generateCypress(testData);
            filename = `${sanitizeFilename(testCaseName)}.cy.js`;
            mimeType = 'text/javascript';
            break;
        case 'json':
            content = JSON.stringify(testData, null, 2);
            filename = `${sanitizeFilename(testCaseName)}.json`;
            mimeType = 'application/json';
            break;
        case 'excel':
            downloadExcel(testData);
            return;
    }

    downloadFile(content, filename, mimeType);
}

function sanitizeFilename(name) {
    return name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

function generateSeleniumPython(testData) {
    return `# ${testData.name}
# Generated on: ${new Date(testData.timestamp).toLocaleString()}
# Page: ${testData.pageTitle}
# URL: ${testData.url}

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
import time

def test_${sanitizeFilename(testData.name)}():
    # Initialize WebDriver
    driver = webdriver.Chrome()
    wait = WebDriverWait(driver, 10)
    
    try:
        # Navigate to page
        driver.get("${testData.url}")
        time.sleep(2)
        
${testData.fields.map(field => generatePythonStep(field)).join('\n')}
        
        # Add assertions here
        print("Test completed successfully!")
        
    finally:
        driver.quit()

${testData.fields.map(field => generatePythonHelper(field)).filter(Boolean).join('\n\n')}

if __name__ == "__main__":
    test_${sanitizeFilename(testData.name)}()
`;
}

function generatePythonStep(field) {
    const selector = convertToPythonSelector(field.selector);
    
    switch (field.action) {
        case 'click':
            return `        # Click on ${field.tagName}
        element = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "${selector}")))
        element.click()
        time.sleep(1)`;
        
        case 'input':
            return `        # Enter text in ${field.tagName}
        element = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "${selector}")))
        element.clear()
        element.send_keys("${escapeString(field.value)}")
        time.sleep(0.5)`;
        
        case 'select':
            return `        # Select option
        from selenium.webdriver.support.ui import Select
        element = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "${selector}")))
        select = Select(element)
        select.select_by_visible_text("${escapeString(field.value)}")
        time.sleep(0.5)`;
        
        default:
            return `        # ${field.action} on ${field.tagName}
        element = driver.find_element(By.CSS_SELECTOR, "${selector}")`;
    }
}

function generatePythonHelper(field) {
    return null; // Add helper functions if needed
}

function generateSeleniumJava(testData) {
    const className = sanitizeFilename(testData.name).split('_').map(s => 
        s.charAt(0).toUpperCase() + s.slice(1)
    ).join('');
    
    return `// ${testData.name}
// Generated on: ${new Date(testData.timestamp).toLocaleString()}
// Page: ${testData.pageTitle}
// URL: ${testData.url}

import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.WebDriverWait;
import org.openqa.selenium.support.ui.ExpectedConditions;
import org.openqa.selenium.support.ui.Select;
import java.time.Duration;

public class ${className}Test {
    
    public static void main(String[] args) {
        WebDriver driver = new ChromeDriver();
        WebDriverWait wait = new WebDriverWait(driver, Duration.ofSeconds(10));
        
        try {
            // Navigate to page
            driver.get("${testData.url}");
            Thread.sleep(2000);
            
${testData.fields.map(field => generateJavaStep(field)).join('\n')}
            
            System.out.println("Test completed successfully!");
            
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            driver.quit();
        }
    }
}
`;
}

function generateJavaStep(field) {
    const selector = convertToJavaSelector(field.selector);
    
    switch (field.action) {
        case 'click':
            return `            // Click on ${field.tagName}
            WebElement element${field.id} = wait.until(ExpectedConditions.elementToBeClickable(By.cssSelector("${selector}")));
            element${field.id}.click();
            Thread.sleep(1000);`;
        
        case 'input':
            return `            // Enter text in ${field.tagName}
            WebElement element${field.id} = wait.until(ExpectedConditions.presenceOfElementLocated(By.cssSelector("${selector}")));
            element${field.id}.clear();
            element${field.id}.sendKeys("${escapeString(field.value)}");
            Thread.sleep(500);`;
        
        case 'select':
            return `            // Select option
            WebElement element${field.id} = wait.until(ExpectedConditions.presenceOfElementLocated(By.cssSelector("${selector}")));
            Select select${field.id} = new Select(element${field.id});
            select${field.id}.selectByVisibleText("${escapeString(field.value)}");
            Thread.sleep(500);`;
        
        default:
            return `            // ${field.action} on ${field.tagName}
            WebElement element${field.id} = driver.findElement(By.cssSelector("${selector}"));`;
    }
}

function generatePlaywright(testData) {
    return `// ${testData.name}
// Generated on: ${new Date(testData.timestamp).toLocaleString()}
// Page: ${testData.pageTitle}
// URL: ${testData.url}

const { test, expect } = require('@playwright/test');

test('${testData.name}', async ({ page }) => {
    // Navigate to page
    await page.goto('${testData.url}');
    await page.waitForLoadState('networkidle');
    
${testData.fields.map(field => generatePlaywrightStep(field)).join('\n')}
    
    // Add assertions here
    console.log('Test completed successfully!');
});
`;
}

function generatePlaywrightStep(field) {
    switch (field.action) {
        case 'click':
            return `    // Click on ${field.tagName}
    await page.locator('${field.selector}').click();
    await page.waitForTimeout(1000);`;
        
        case 'input':
            return `    // Enter text in ${field.tagName}
    await page.locator('${field.selector}').fill('${escapeString(field.value)}');
    await page.waitForTimeout(500);`;
        
        case 'select':
            return `    // Select option
    await page.locator('${field.selector}').selectOption('${escapeString(field.value)}');
    await page.waitForTimeout(500);`;
        
        default:
            return `    // ${field.action} on ${field.tagName}
    await page.locator('${field.selector}');`;
    }
}

function generateCypress(testData) {
    return `// ${testData.name}
// Generated on: ${new Date(testData.timestamp).toLocaleString()}
// Page: ${testData.pageTitle}
// URL: ${testData.url}

describe('${testData.name}', () => {
    it('should complete the test flow', () => {
        // Navigate to page
        cy.visit('${testData.url}');
        
${testData.fields.map(field => generateCypressStep(field)).join('\n')}
        
        // Add assertions here
        cy.log('Test completed successfully!');
    });
});
`;
}

function generateCypressStep(field) {
    switch (field.action) {
        case 'click':
            return `        // Click on ${field.tagName}
        cy.get('${field.selector}').click();
        cy.wait(1000);`;
        
        case 'input':
            return `        // Enter text in ${field.tagName}
        cy.get('${field.selector}').clear().type('${escapeString(field.value)}');
        cy.wait(500);`;
        
        case 'select':
            return `        // Select option
        cy.get('${field.selector}').select('${escapeString(field.value)}');
        cy.wait(500);`;
        
        default:
            return `        // ${field.action} on ${field.tagName}
        cy.get('${field.selector}');`;
    }
}

function downloadExcel(testData) {
    // Create CSV format for Excel
    let csv = 'Step,Action,Element Type,Selector,Value,ID,Name,Timestamp\n';
    
    testData.fields.forEach((field, index) => {
        csv += `${index + 1},`;
        csv += `"${field.action}",`;
        csv += `"${field.tagName || field.type}",`;
        csv += `"${field.selector}",`;
        csv += `"${escapeString(field.value || '')}",`;
        csv += `"${field.id || ''}",`;
        csv += `"${field.name || ''}",`;
        csv += `"${new Date(field.timestamp).toLocaleString()}"\n`;
    });
    
    downloadFile(csv, `${sanitizeFilename(testData.name)}.csv`, 'text/csv');
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

function saveCurrentTest() {
    if (capturedFields.length === 0) {
        alert('No captured fields to save');
        return;
    }

    const name = prompt('Enter a name for this test case:');
    if (!name) return;

    chrome.runtime.sendMessage({ type: 'STORE_TEST', name: name, data: capturedFields }, (resp) => {
        if (resp && resp.ok) alert('Test saved: ' + name);
        else alert('Failed to save test');
    });
}

async function runStoredTestPrompt() {
    const name = prompt('Enter the name of the stored test to run:');
    if (!name) return;

    // Request background to run the stored test. Background will ensure forwarding to the active tab.
    chrome.runtime.sendMessage({ type: 'RUN_STORED', name: name }, (resp) => {
        if (resp && resp.ok) {
            captureStatus.textContent = 'Replaying';
        } else {
            alert('Failed to run stored test: ' + (resp && resp.error));
        }
    });
}