async function saveDataDictionary() {
    console.log("DEBUG: saveDataDictionary function started."); // ADD THIS
    const dictionaryNameInput = document.getElementById('dictionaryName');
    let dictionaryName = dictionaryNameInput.value.trim();

    // IMPORTANT: Collect rules for the CURRENTLY ACTIVE SHEET before saving
    if (currentSheetName) {
        const currentSheetRulesFromUI = collectRules();
        sheetRulesMap.set(currentSheetName, currentSheetRulesFromUI);
        console.log(`DEBUG: Saved current UI rules to sheetRulesMap for "${currentSheetName}":`, currentSheetRulesFromUI);
    } else {
        console.warn("DEBUG: currentSheetName is null. Cannot save rules to sheetRulesMap.");
    }

    const rulesToSave = sheetRulesMap.get(currentSheetName);
    if (!rulesToSave || rulesToSave.length === 0) {
        displayMessage('saveStatus', 'No rules defined for the current sheet to save.', 'error');
        console.error("DEBUG: No rules to save for current sheet. Aborting save."); // ADD THIS
        return; // THIS IS A CRITICAL RETURN POINT
    }

    const sourceHeadersToSave = sheetHeadersMap.get(currentSheetName);
    if (!sourceHeadersToSave || sourceHeadersToSave.length === 0) {
        displayMessage('saveStatus', 'Cannot save: No headers found for the current sheet.', 'error');
        console.error("DEBUG: No headers to save for current sheet. Aborting save."); // ADD THIS
        return; // THIS IS ANOTHER CRITICAL RETURN POINT
    }

    if (!dictionaryName) {
        displayMessage('saveStatus', 'Please enter a name for your data dictionary.', 'error');
        dictionaryNameInput.focus();
        console.error("DEBUG: Dictionary name is empty. Aborting save."); // ADD THIS
        return; // AND ANOTHER CRITICAL RETURN POINT
    }

    // ... (rest of your existing dictionary name adjustment logic) ...

    displayMessage('saveStatus', 'Saving data dictionary...', 'info');
    document.getElementById('saveDictionaryBtn').disabled = true;
    document.getElementById('printDictionaryBtn').disabled = true;

    const token = localStorage.getItem('jwtToken');
    if (!token) {
        displayMessage('saveStatus', 'Authentication required. Please log in again.', 'error');
        console.error("DEBUG: No JWT token found. Aborting save."); // ADD THIS
        document.getElementById('saveDictionaryBtn').disabled = false;
        document.getElementById('printDictionaryBtn').disabled = false;
        return; // FINAL CRITICAL RETURN POINT BEFORE FETCH
    }

    const payload = {
        dictionaryName,
        rules_json: rulesToSave,
        source_headers_json: sourceHeadersToSave,
        ...(isEditingExistingDictionary && currentDictionaryId && { id: currentDictionaryId })
    };
    console.log("DEBUG: Payload being sent:", payload); // ADD THIS

    try {
        console.log("DEBUG: Initiating fetch request to /api/save-data-dictionary"); // ADD THIS RIGHT HERE
        const response = await fetch('/api/save-data-dictionary', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        // ... (rest of your fetch logic) ...
    } catch (error) {
        console.error('DEBUG: Frontend save error during fetch:', error); // ADD THIS
        // ...
    } finally {
        // ...
    }
}
