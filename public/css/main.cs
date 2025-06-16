@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

body, html {
    margin: 0;
    padding: 0;
    font-family: 'Inter', sans-serif;
    background-color: #F8F9FB;
    color: #333;
    line-height: 1.6;
}

/* Top Navigation Bar */
.top-nav {
    background-color: #2D62B3;
    padding: 1rem 2.5rem; /* Equivalent to p-4 px-10 */
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    font-family: 'Inter', sans-serif;
}
.tool-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 1.25rem; /* Equivalent to space-x-5 */
}
.tool-link {
    color: white;
    text-decoration: none;
    font-weight: 500;
    font-size: 1rem;
    padding: 0.5rem 0.9375rem; /* Equivalent to px-4 py-2.5 */
    border-radius: 0.375rem; /* Equivalent to rounded-lg */
    transition: background-color 0.3s ease;
}
.tool-link:hover {
    background-color: #2756A5;
}
.tool-link.active {
    background-color: #2756A5;
    font-weight: 600;
}
.logout-button {
    padding: 0.5rem 1.125rem;
    border: none;
    background-color: #6c757d;
    color: white;
    font-size: 1rem;
    font-weight: 500;
    border-radius: 0.375rem;
    cursor: pointer;
    transition: background-color 0.3s ease;
    font-family: 'Inter', sans-serif;
}
.logout-button:hover {
    background-color: #5a6268;
}

/* Main Content Styling */
.container {
    max-width: 75rem; /* Equivalent to max-w-6xl */
    margin: 1.875rem auto; /* Equivalent to mt-8 */
    padding: 1.25rem;
}
.page-header {
    text-align: center;
    margin-bottom: 1.25rem;
}
.page-header h1 {
    color: #2756A5;
    font-size: 2.5rem;
    font-weight: 700;
    margin: 0;
}
.content-box {
    background-color: #ffffff;
    padding: 1.875rem;
    border-radius: 0.5rem;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.05);
    border: 1px solid #e9ecef;
    margin-bottom: 1.5625rem;
}

h2, h3, h4 {
    color: #2c3e50;
}
.intro-text {
    margin-bottom: 0.8em;
    font-size: 1rem;
    color: #495057;
}
input[type="file"] {
    margin-bottom: 1.25rem;
    font-family: 'Inter', sans-serif;
    display: block;
    width: 100%;
    box-sizing: border-box;
}

/* Updated button and select styles for consistency */
button, .action-button, select, input[type="text"] {
    padding: 10px 18px;
    border: 1px solid #ced4da;
    border-radius: 6px;
    font-size: 1.0em;
    font-family: 'Inter', sans-serif;
    transition: all 0.2s ease;
    box-sizing: border-box;
}
button, .action-button {
    background-color: #2D62B3;
    color: white;
    border: none;
    cursor: pointer;
    margin-right: 10px;
    margin-top: 10px;
}
button:hover, .action-button:hover {
    background-color: #2756A5;
    transform: translateY(-2px);
    box-shadow: 0 4px 10px rgba(45, 98, 179, 0.2);
}
select:focus, input[type="text"]:focus {
    border-color: #2D62B3;
    box-shadow: 0 0 0 0.2rem rgba(45, 98, 179, 0.25);
    outline: none;
}

.toggle-values-btn {
    font-size: 0.85em;
    padding: 6px 12px;
    margin-left: 15px;
    background-color: #6c757d;
}
.toggle-values-btn:hover {
    background-color: #5a6268;
}

.loader {
    border: 6px solid #e9ecef;
    border-top: 6px solid #2D62B3;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    animation: spin 0.8s linear infinite;
    display: none;
    margin: 25px auto;
}

#results {
    margin-top: 25px;
}
#results ul {
    list-style-type: none;
    padding: 0;
}
#results li {
    padding: 10px 0;
    border-bottom: 1px solid #e9ecef;
    line-height: 1.5;
}
#results li:last-child {
    border-bottom: none;
}
.count-display {
    font-weight: 500;
    margin-top: 8px;
    font-size: 1.1em;
    color: #34495e;
}

#overallCounts, .summary-section {
    margin-bottom: 25px;
    padding: 20px;
    background-color: #f8f9fa;
    border-radius: 6px;
}
.column-summary {
    display: flex;
    flex-direction: column;
    padding: 8px 0;
}
.column-header-controls {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    margin-bottom: 5px;
}
.column-issue-text {
    flex-grow: 1;
}
.column-issue-text .clean {
    color: #28a745;
    font-weight: 500;
}
.column-issue-text .issues {
    color: #dc3545;
    font-weight: 500;
} /* For custom rules */
.column-counts {
    font-style: italic;
    color: #495057;
    font-size: 0.9em;
    margin-top: 3px;
}

.column-values-container {
    margin-top: 12px;
    margin-left: 25px;
    padding: 12px;
    background-color: #ffffff;
    border: 1px solid #dee2e6;
    border-radius: 6px;
    max-height: 350px;
    overflow-y: auto;
    box-shadow: inset 0 1px 3px rgba(0,0,0,0.05);
}
.column-values-container ul {
    list-style-type: none;
    padding-left: 0;
}
.column-values-container li {
    padding: 4px 0;
    border-bottom: none;
    font-size: 0.9em;
}
.value-date {
    color: #007bff;
}
.value-future-date {
    color: #e74c3c;
    font-weight: bold;
}
.value-null {
    color: #dc3545;
    font-style: italic;
}
.value-blank {
    color: #fd7e14;
    font-style: italic;
}
.value-generic-issue {
    font-weight: bold;
    color: #e67e22;
} /* Used for custom issues */

.column-summary.column-overridden .column-issue-text, .column-summary.column-overridden .column-counts {
    text-decoration: line-through;
    color: #adb5bd;
}
.override-checkbox-label {
    margin-right: 5px;
    font-size: 0.9em;
    color: #495057;
    cursor:pointer;
}
.override-checkbox {
    margin-right: 3px;
    cursor:pointer;
    vertical-align: middle;
}

#summaryReportContainer table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 20px;
}
#summaryReportContainer th, #summaryReportContainer td {
    border: 1px solid #dee2e6;
    padding: 10px;
    text-align: left;
}
#summaryReportContainer th {
    background-color: #e9ecef;
    font-weight: 600;
}
.pass-status {
    color: #28a745;
    font-weight: bold;
}
.fail-status {
    color: #dc3545;
    font-weight: bold;
}
#printSummaryBtn {
    background-color: #28a745;
}
#printSummaryBtn:hover {
    background-color: #218838;
}
#exportExcelBtn {
    background-color: #17a2b8;
}
#exportExcelBtn:hover {
    background-color: #138496;
}
.editable-stat {
    background-color: #fffde7;
    padding: 6px;
    border-radius: 4px;
}
.editable-stat:focus {
    background-color: #fff9c4;
    outline: 2px solid #2D62B3;
}
.stat-overridden-marker {
    color: #6c757d;
    font-style: italic;
    font-size: 0.9em;
}
td.editable-stat.stat-is-overridden {
    text-decoration: line-through;
    color: #adb5bd;
    background-color: #f8f9fa !important;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

@media (max-width: 992px) {
    .top-nav {
        flex-direction: column;
        padding: 15px;
        gap: 15px;
    }
    .tool-list {
        flex-direction: column;
        width: 100%;
        align-items: center;
        gap: 10px;
    }
    .tool-link {
        display: block;
        width: 100%;
        text-align: center;
    }
}

@media print {
    body { background-color: #fff; }
    body * { visibility: hidden; }
    #summaryReportContainer, #summaryReportContainer * { visibility: visible; }
    #summaryReportContainer {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        border: none !important;
        box-shadow: none !important;
        margin:0 !important;
        padding:0 !important;
        border-radius: 0;
    }
    .action-button, #printSummaryBtn, #exportExcelBtn, #analyzeFileBtnContainer button, input[type="file"], .container > p:not(#fileName):not(.intro-text), .container > h1:not(#summaryReportContainer h1), .toggle-values-btn, .override-checkbox, .override-checkbox-label, .loader {
        display: none !important;
    }
    #summaryReportContainer h1, #summaryReportContainer h2, #summaryReportContainer h3, #summaryReportContainer h4 {
        color: black !important;
        border: none !important;
    }
    #summaryReportContainer table, #summaryReportContainer th, #summaryReportContainer td {
        border: 1px solid #666 !important;
    }
    #summaryReportContainer th {
        background-color: #eee !important;
    }
    a { text-decoration: none; color: black !important; }
    td.editable-stat {
        background-color: white !important;
        text-decoration: none !important;
        color: black !important;
    }
    .stat-overridden-marker, .logout-button, .top-nav {
        display: none !important;
    }
    .pass-status { color: #006400 !important; }
    .fail-status { color: #8B0000 !important; }
}
