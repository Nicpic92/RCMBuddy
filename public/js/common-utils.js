/**
 * Displays a loading spinner and optionally disables elements.
 * @param {string} loaderId The ID of the loader element to show. Defaults to 'loader'.
 * @param {string[]} [elementsToDisable=[]] An array of IDs of elements to disable.
 */
export function showLoader(loaderId = 'loader', elementsToDisable = []) {
    const loader = document.getElementById(loaderId);
    if (loader) {
        loader.style.display = 'block';
    }
    elementsToDisable.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = true;
        }
    });
}

/**
 * Hides a loading spinner and optionally enables elements.
 * @param {string} loaderId The ID of the loader element to hide. Defaults to 'loader'.
 * @param {string[]} [elementsToEnable=[]] An array of IDs of elements to enable.
 */
export function hideLoader(loaderId = 'loader', elementsToEnable = []) {
    const loader = document.getElementById(loaderId);
    if (loader) {
        loader.style.display = 'none';
    }
    elementsToEnable.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.disabled = false;
        }
    });
}

/**
 * Displays a message on a specified UI element.
 * @param {string} elementId The ID of the element where the message will be displayed.
 * @param {string} message The message text.
 * @param {'info' | 'success' | 'error'} type The type of message to determine styling.
 */
export function displayMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        // Basic color styling based on type
        if (type === 'error') {
            element.style.color = '#dc3545'; // Red
        } else if (type === 'success') {
            element.style.color = '#28a745'; // Green
        } else {
            element.style.color = '#495057'; // Gray (default)
        }
        element.style.display = 'block'; // Ensure the message element is visible
    }
}
