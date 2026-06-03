const {
    escapeHtml,
    sanitizeFilename,
    convertToPythonSelector,
    convertToJavaSelector,
    escapeString
} = require('../popup/utils');

describe('popup/utils', () => {
    test('escapeHtml encodes special characters', () => {
        const input = '<div>"Hello" & \'World\'';
        const output = escapeHtml(input);

        expect(output).toBe('&lt;div&gt;&quot;Hello&quot; &amp; &#039;World&#039;');
    });

    test('sanitizeFilename converts invalid chars to underscores', () => {
        const input = 'My Test/File:Name';
        const output = sanitizeFilename(input);

        expect(output).toBe('my_test_file_name');
    });

    test('convertToPythonSelector escapes double quotes', () => {
        const input = 'button[title="Click"]';
        const output = convertToPythonSelector(input);

        expect(output).toBe('button[title=\\"Click\\"]');
    });

    test('convertToJavaSelector escapes double quotes', () => {
        const input = 'input[value="Hello"]';
        const output = convertToJavaSelector(input);

        expect(output).toBe('input[value=\\"Hello\\"]');
    });

    test('escapeString escapes quotes and newlines', () => {
        const input = 'Say "Hi"\nand \'Bye\'';
        const output = escapeString(input);

        expect(output).toBe("Say \\\"Hi\\\"\\nand \\'Bye\\'");
    });
});
