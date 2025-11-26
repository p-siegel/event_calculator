// Wizard state
let currentStep = 1;
let eventId = null;
let eventData = {
    name: '',
    responsibles: [],
    expenses: [],
    incomeWithoutExpense: []
};

// Format EUR amount for display
function formatEURInput(value) {
    if (!value) return '';
    
    // If already a number, format it directly
    if (typeof value === 'number') {
        return value.toFixed(2).replace('.', ',') + ' €';
    }
    
    // Remove all non-digit characters except comma and dot
    let numericValue = value.toString().replace(/[^\d,.-]/g, '');
    
    // Replace comma with dot for parsing
    numericValue = numericValue.replace(',', '.');
    
    // Remove multiple dots/commas, keep only the first one
    const parts = numericValue.split('.');
    if (parts.length > 2) {
        numericValue = parts[0] + '.' + parts.slice(1).join('');
    }
    
    // Parse to float
    const num = parseFloat(numericValue);
    if (isNaN(num)) return '';
    
    // Format with German locale (comma as decimal separator)
    return num.toFixed(2).replace('.', ',') + ' €';
}

// Parse EUR formatted string to number
function parseEURInput(value) {
    if (!value) return 0;
    
    // Remove currency symbol and spaces
    let numericValue = value.toString().replace(/[€\s]/g, '');
    
    // Replace comma with dot
    numericValue = numericValue.replace(',', '.');
    
    // Parse to float
    const num = parseFloat(numericValue);
    return isNaN(num) ? 0 : num;
}

// Check if editing existing event
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const editEventId = urlParams.get('eventId');
    
    if (editEventId) {
        eventId = parseInt(editEventId);
        loadEventData();
    }
    
    initializeWizard();
    initializeInfoButtons();
});

// Initialize info buttons
function initializeInfoButtons() {
    const infoButtons = document.querySelectorAll('.info-btn');
    const infoModal = document.getElementById('infoModal');
    const infoModalText = document.getElementById('infoModalText');
    const infoModalClose = document.querySelector('.info-modal-close');
    
    if (!infoModal || !infoModalText) return;
    
    // Add click handlers to all info buttons
    infoButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const infoText = button.getAttribute('data-info');
            if (infoText) {
                infoModalText.textContent = infoText;
                infoModal.style.display = 'block';
            }
        });
    });
    
    // Close modal when clicking close button
    if (infoModalClose) {
        infoModalClose.addEventListener('click', () => {
            infoModal.style.display = 'none';
        });
    }
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === infoModal) {
            infoModal.style.display = 'none';
        }
    });
    
    // Close modal on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && infoModal.style.display === 'block') {
            infoModal.style.display = 'none';
        }
    });
}

// Initialize wizard
function initializeWizard() {
    // Step 1 form handler
    const step1Form = document.getElementById('step1Form');
    if (step1Form) {
        step1Form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const eventName = document.getElementById('eventName').value.trim();
            
            if (!eventName) {
                alert('Bitte geben Sie einen Event-Namen ein.');
                return;
            }
            
            eventData.name = eventName;
            
            // If editing, update event name
            if (eventId) {
                try {
                    const response = await fetch(`/api/events/${eventId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ name: eventName })
                    });
                    
                    if (!response.ok) {
                        throw new Error('Failed to update event');
                    }
                } catch (error) {
                    console.error('Error updating event:', error);
                    alert('Fehler beim Aktualisieren des Event-Namens');
                    return;
                }
            } else {
                // Create new event
                try {
                    const response = await fetch('/api/events', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ name: eventName })
                    });
                    
                    const data = await response.json();
                    
                    if (response.ok) {
                        eventId = data.id;
                    } else {
                        throw new Error(data.error || 'Failed to create event');
                    }
                } catch (error) {
                    console.error('Error creating event:', error);
                    alert('Fehler beim Erstellen des Events');
                    return;
                }
            }
            
            goToStep(2);
        });
    }
    
    // Step 2: Add responsible function
    const addResponsible = async () => {
        const responsibleName = document.getElementById('responsibleName').value.trim();
        
        if (!responsibleName) {
            alert('Bitte geben Sie einen Namen ein.');
            return;
        }
        
        if (!eventId) {
            alert('Bitte erstellen Sie zuerst das Event.');
            return;
        }
        
        try {
            const response = await fetch(`/api/events/${eventId}/responsibles`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name: responsibleName })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                eventData.responsibles.push(data);
                document.getElementById('responsibleName').value = '';
                displayResponsibles();
            } else {
                alert(data.error || 'Fehler beim Hinzufügen des Verantwortlichen');
            }
        } catch (error) {
            console.error('Error adding responsible:', error);
            alert('Ein Fehler ist aufgetreten');
        }
    };
    
    // Step 2: Add responsible button
    const addResponsibleBtn = document.getElementById('addResponsibleBtn');
    if (addResponsibleBtn) {
        addResponsibleBtn.addEventListener('click', addResponsible);
    }
    
    // Step 2: Prevent form submission and handle Enter key
    const step2Form = document.getElementById('step2Form');
    if (step2Form) {
        step2Form.addEventListener('submit', (e) => {
            e.preventDefault();
            addResponsible();
        });
    }
    
    // Step 2: Handle Enter key in input field
    const responsibleNameInput = document.getElementById('responsibleName');
    if (responsibleNameInput) {
        responsibleNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addResponsible();
            }
        });
    }
    
    // Step 3: Setup EUR formatting for cost field
    const costPerUnitInput = document.getElementById('expenseCostPerUnit');
    
    if (costPerUnitInput) {
        costPerUnitInput.addEventListener('input', (e) => {
            // Allow typing, but format on blur
            const value = e.target.value;
            // Remove currency symbol if user types it
            e.target.value = value.replace(/[€]/g, '').trim();
        });
        
        costPerUnitInput.addEventListener('blur', (e) => {
            const formatted = formatEURInput(e.target.value);
            if (formatted) {
                e.target.value = formatted;
            }
        });
        
        costPerUnitInput.addEventListener('focus', (e) => {
            // Remove formatting on focus for easier editing
            const value = e.target.value.replace(/[€\s]/g, '').trim();
            e.target.value = value;
        });
    }
    
    // Step 3: Expense form handler
    const expenseForm = document.getElementById('expenseForm');
    if (expenseForm) {
        expenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const category = document.getElementById('expenseCategory').value;
            const name = document.getElementById('expenseName').value.trim();
            const quantity = parseFloat(document.getElementById('expenseQuantity').value);
            const costPerUnit = parseEURInput(document.getElementById('expenseCostPerUnit').value);
            
            if (!category || !name || !quantity || !costPerUnit) {
                alert('Bitte füllen Sie alle erforderlichen Felder aus.');
                return;
            }
            
            if (!eventId) {
                alert('Bitte erstellen Sie zuerst das Event.');
                return;
            }
            
            try {
                let response;
                if (editingExpenseId) {
                    // Update existing expense
                    response = await fetch(`/api/expenses/${editingExpenseId}`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            category,
                            name,
                            quantity,
                            cost_per_unit: costPerUnit,
                            selling_price_per_unit: null
                        })
                    });
                } else {
                    // Create new expense
                    response = await fetch(`/api/events/${eventId}/expenses`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            category,
                            name,
                            quantity,
                            cost_per_unit: costPerUnit,
                            selling_price_per_unit: null
                        })
                    });
                }
                
                const data = await response.json();
                
                if (response.ok) {
                    if (editingExpenseId) {
                        // Update existing expense in array
                        const index = eventData.expenses.findIndex(e => e.id === editingExpenseId);
                        if (index !== -1) {
                            eventData.expenses[index] = data;
                        }
                        editingExpenseId = null;
                        const submitBtn = document.querySelector('#expenseForm button[type="submit"]');
                        if (submitBtn) {
                            submitBtn.textContent = 'Hinzufügen';
                        }
                    } else {
                        // Add new expense
                        eventData.expenses.push(data);
                    }
                    
                    // Save the selected category before resetting
                    const selectedCategory = document.getElementById('expenseCategory').value;
                    
                    expenseForm.reset();
                    
                    // Restore the selected category after reset
                    if (selectedCategory) {
                        document.getElementById('expenseCategory').value = selectedCategory;
                    }
                    
                    displayExpenses();
                    updateCalculationsStep3();
                } else {
                    alert(data.error || (editingExpenseId ? 'Fehler beim Aktualisieren der Ausgabe' : 'Fehler beim Hinzufügen der Ausgabe'));
                }
            } catch (error) {
                console.error('Error saving expense:', error);
                alert('Ein Fehler ist aufgetreten');
            }
        });
    }
    
    // Step 4: Income without expense form handler
    const incomeWithoutExpenseForm = document.getElementById('incomeWithoutExpenseForm');
    if (incomeWithoutExpenseForm) {
        incomeWithoutExpenseForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('incomeName').value.trim();
            const quantity = parseFloat(document.getElementById('incomeQuantity').value);
            const pricePerUnit = parseEURInput(document.getElementById('incomePricePerUnit').value);
            
            if (!name || !quantity || !pricePerUnit) {
                alert('Bitte füllen Sie alle Felder aus.');
                return;
            }
            
            if (!eventId) {
                alert('Bitte erstellen Sie zuerst das Event.');
                return;
            }
            
            try {
                const response = await fetch(`/api/events/${eventId}/income-without-expense`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name,
                        quantity,
                        price_per_unit: pricePerUnit
                    })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    eventData.incomeWithoutExpense.push(data);
                    incomeWithoutExpenseForm.reset();
                    displayIncomeWithoutExpense();
                    updateCalculationsStep4();
                } else {
                    alert(data.error || 'Fehler beim Hinzufügen der Einnahme');
                }
            } catch (error) {
                console.error('Error adding income:', error);
                alert('Ein Fehler ist aufgetreten');
            }
        });
    }
    
    // Step 4: Setup EUR formatting for income price field
    const incomePricePerUnitInput = document.getElementById('incomePricePerUnit');
    if (incomePricePerUnitInput) {
        incomePricePerUnitInput.addEventListener('input', (e) => {
            const value = e.target.value;
            e.target.value = value.replace(/[€]/g, '').trim();
        });
        
        incomePricePerUnitInput.addEventListener('blur', (e) => {
            const formatted = formatEURInput(e.target.value);
            if (formatted) {
                e.target.value = formatted;
            }
        });
        
        incomePricePerUnitInput.addEventListener('focus', (e) => {
            const value = e.target.value.replace(/[€\s]/g, '').trim();
            e.target.value = value;
        });
    }
    
    // Finish wizard button
    const finishWizardBtn = document.getElementById('finishWizardBtn');
    if (finishWizardBtn) {
        finishWizardBtn.addEventListener('click', () => {
            window.location.href = '/index.html';
        });
    }
}

// Load event data if editing
async function loadEventData() {
    try {
        const response = await fetch(`/api/events/${eventId}`);
        const data = await response.json();
        
        if (response.ok) {
            eventData.name = data.name;
            eventData.responsibles = data.responsibles || [];
            eventData.expenses = data.expenses || [];
            eventData.incomeWithoutExpense = data.incomeWithoutExpense || [];
            
            // Populate step 1
            document.getElementById('eventName').value = data.name;
            
            // Display responsibles if on step 2 or 3
            if (currentStep >= 2) {
                displayResponsibles();
            }
            
            // Display expenses if on step 3
            if (currentStep >= 3) {
                displayExpenses();
                updateCalculationsStep3();
            }
            
            // Display step 4 data if on step 4
            if (currentStep >= 4) {
                displayExpensesIncomeList();
                displayIncomeWithoutExpense();
                updateCalculationsStep4();
            }
        } else {
            alert('Fehler beim Laden der Event-Daten');
        }
    } catch (error) {
        console.error('Error loading event data:', error);
        alert('Ein Fehler ist aufgetreten');
    }
}

// Navigate to step
function goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.wizard-step-content').forEach(stepContent => {
        stepContent.style.display = 'none';
    });
    
    // Show target step
    const targetStep = document.getElementById(`step${step}`);
    if (targetStep) {
        targetStep.style.display = 'block';
    }
    
    // Update step indicators
    document.querySelectorAll('.wizard-step').forEach((stepEl, index) => {
        const stepNum = index + 1;
        if (stepNum < step) {
            stepEl.classList.add('completed');
            stepEl.classList.remove('active');
        } else if (stepNum === step) {
            stepEl.classList.add('active');
            stepEl.classList.remove('completed');
        } else {
            stepEl.classList.remove('active', 'completed');
        }
    });
    
    const previousStep = currentStep;
    currentStep = step;
    
    // Load data if editing and we need data for the target step
    if (eventId) {
        if (step === 2 && eventData.responsibles.length === 0) {
            loadEventData();
        } else if (step === 3 && eventData.expenses.length === 0) {
            loadEventData();
        } else if (step === 4 && (eventData.expenses.length === 0 || eventData.incomeWithoutExpense.length === 0)) {
            loadEventData();
        }
    }
    
    // Display data for current step
    if (step === 2) {
        displayResponsibles();
    } else if (step === 3) {
        displayExpenses();
        updateCalculationsStep3();
    } else if (step === 4) {
        displayExpensesIncomeList();
        displayIncomeWithoutExpense();
        updateCalculationsStep4();
    }
}

// Display responsibles
function displayResponsibles() {
    const responsiblesList = document.getElementById('responsiblesList');
    
    if (!responsiblesList) return;
    
    if (eventData.responsibles.length === 0) {
        responsiblesList.innerHTML = '<p class="empty-message">Noch keine Verantwortlichen hinzugefügt.</p>';
        return;
    }
    
    responsiblesList.innerHTML = eventData.responsibles.map(responsible => {
        return `
            <div class="responsible-item">
                <span>${responsible.name}</span>
                <button class="btn btn-danger btn-small" onclick="deleteResponsible(${responsible.id})">Löschen</button>
            </div>
        `;
    }).join('');
}

// Delete responsible
async function deleteResponsible(responsibleId) {
    if (!confirm('Möchten Sie diesen Verantwortlichen wirklich entfernen?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/events/${eventId}/responsibles/${responsibleId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            eventData.responsibles = eventData.responsibles.filter(r => r.id !== responsibleId);
            displayResponsibles();
        } else {
            const data = await response.json();
            alert(data.error || 'Fehler beim Löschen');
        }
    } catch (error) {
        console.error('Error deleting responsible:', error);
        alert('Ein Fehler ist aufgetreten');
    }
}

// Display expenses
function displayExpenses() {
    const expensesList = document.getElementById('expensesList');
    
    if (!expensesList) return;
    
    if (eventData.expenses.length === 0) {
        expensesList.innerHTML = '<p class="empty-message">Noch keine Ausgaben hinzugefügt.</p>';
        return;
    }
    
    // Group expenses by category
    const expensesByCategory = {};
    eventData.expenses.forEach(expense => {
        if (!expensesByCategory[expense.category]) {
            expensesByCategory[expense.category] = [];
        }
        expensesByCategory[expense.category].push(expense);
    });
    
    // Define category order
    const categoryOrder = ['Getränke', 'Speisen', 'Sonstige', 'Ausgabe ohne Einnahme'];
    
    // Build HTML with grouped expenses
    let html = '';
    
    categoryOrder.forEach(category => {
        if (expensesByCategory[category] && expensesByCategory[category].length > 0) {
            const categoryExpenses = expensesByCategory[category];
            const categoryTotal = categoryExpenses.reduce((sum, exp) => sum + (exp.quantity * exp.cost_per_unit), 0);
            
            html += `
                <div class="expense-category-group">
                    <div class="expense-category-header">
                        <h4 class="expense-category-title">${category}</h4>
                        <span class="expense-category-total">Gesamt: ${formatCurrency(categoryTotal)}</span>
                    </div>
                    <div class="expense-category-items">
                        ${categoryExpenses.map(expense => {
                            const totalCost = expense.quantity * expense.cost_per_unit;
                            const hasSellingPrice = expense.selling_price_per_unit !== null && expense.selling_price_per_unit !== undefined;
                            const totalIncome = hasSellingPrice ? (expense.selling_price_per_unit - expense.cost_per_unit) * expense.quantity : 0;
                            
                            return `
                                <div class="expense-item">
                                    <div class="expense-info">
                                        <div class="expense-header">
                                            <span class="expense-name">${expense.name}</span>
                                        </div>
                                        <div class="expense-details">
                                            <span>Menge: ${expense.quantity}</span>
                                            <span>Kosten/Einheit: ${formatCurrency(expense.cost_per_unit)}</span>
                                            ${hasSellingPrice ? `<span>Verkaufspreis/Einheit: ${formatCurrency(expense.selling_price_per_unit)}</span>` : ''}
                                            <span>Gesamtkosten: ${formatCurrency(totalCost)}</span>
                                            ${hasSellingPrice ? `<span>Gewinn: ${formatCurrency(totalIncome)}</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="expense-actions">
                                        <button class="btn btn-primary btn-small" onclick="editExpense(${expense.id})">Bearbeiten</button>
                                        <button class="btn btn-danger btn-small" onclick="deleteExpense(${expense.id})">Löschen</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
    });
    
    // Add any categories not in the predefined order
    Object.keys(expensesByCategory).forEach(category => {
        if (!categoryOrder.includes(category)) {
            const categoryExpenses = expensesByCategory[category];
            const categoryTotal = categoryExpenses.reduce((sum, exp) => sum + (exp.quantity * exp.cost_per_unit), 0);
            
            html += `
                <div class="expense-category-group">
                    <div class="expense-category-header">
                        <h4 class="expense-category-title">${category}</h4>
                        <span class="expense-category-total">Gesamt: ${formatCurrency(categoryTotal)}</span>
                    </div>
                    <div class="expense-category-items">
                        ${categoryExpenses.map(expense => {
                            const totalCost = expense.quantity * expense.cost_per_unit;
                            const hasSellingPrice = expense.selling_price_per_unit !== null && expense.selling_price_per_unit !== undefined;
                            const totalIncome = hasSellingPrice ? (expense.selling_price_per_unit - expense.cost_per_unit) * expense.quantity : 0;
                            
                            return `
                                <div class="expense-item">
                                    <div class="expense-info">
                                        <div class="expense-header">
                                            <span class="expense-name">${expense.name}</span>
                                        </div>
                                        <div class="expense-details">
                                            <span>Menge: ${expense.quantity}</span>
                                            <span>Kosten/Einheit: ${formatCurrency(expense.cost_per_unit)}</span>
                                            ${hasSellingPrice ? `<span>Verkaufspreis/Einheit: ${formatCurrency(expense.selling_price_per_unit)}</span>` : ''}
                                            <span>Gesamtkosten: ${formatCurrency(totalCost)}</span>
                                            ${hasSellingPrice ? `<span>Gewinn: ${formatCurrency(totalIncome)}</span>` : ''}
                                        </div>
                                    </div>
                                    <div class="expense-actions">
                                        <button class="btn btn-primary btn-small" onclick="editExpense(${expense.id})">Bearbeiten</button>
                                        <button class="btn btn-danger btn-small" onclick="deleteExpense(${expense.id})">Löschen</button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        }
    });
    
    expensesList.innerHTML = html;
}

// Edit expense
let editingExpenseId = null;

function editExpense(expenseId) {
    const expense = eventData.expenses.find(e => e.id === expenseId);
    if (!expense) return;
    
    editingExpenseId = expenseId;
    
    // Populate form
    document.getElementById('expenseCategory').value = expense.category;
    document.getElementById('expenseName').value = expense.name;
    document.getElementById('expenseQuantity').value = expense.quantity;
    // Format EUR values for display
    document.getElementById('expenseCostPerUnit').value = formatEURInput(expense.cost_per_unit.toString());
    
    // Update submit button text
    const submitBtn = document.querySelector('#expenseForm button[type="submit"]');
    if (submitBtn) {
        submitBtn.textContent = 'Aktualisieren';
    }
}

// Delete expense
async function deleteExpense(expenseId) {
    if (!confirm('Möchten Sie diese Ausgabe wirklich löschen?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/expenses/${expenseId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            eventData.expenses = eventData.expenses.filter(e => e.id !== expenseId);
            displayExpenses();
            updateCalculationsStep3();
        } else {
            const data = await response.json();
            alert(data.error || 'Fehler beim Löschen');
        }
    } catch (error) {
        console.error('Error deleting expense:', error);
        alert('Ein Fehler ist aufgetreten');
    }
}

// Update calculations for step 3
function updateCalculationsStep3() {
    const totalExpenses = eventData.expenses.reduce((sum, expense) => {
        return sum + (expense.quantity * expense.cost_per_unit);
    }, 0);
    
    document.getElementById('totalExpenses').textContent = formatCurrency(totalExpenses);
}

// Display expenses income list for step 4
function displayExpensesIncomeList() {
    const expensesIncomeList = document.getElementById('expensesIncomeList');
    
    if (!expensesIncomeList) return;
    
    // Filter out expenses without income category
    const expensesWithIncome = eventData.expenses.filter(e => e.category !== 'Ausgabe ohne Einnahme');
    
    if (expensesWithIncome.length === 0) {
        expensesIncomeList.innerHTML = '<p class="empty-message">Keine Ausgaben vorhanden, für die Einnahmen erfasst werden können.</p>';
        return;
    }
    
    expensesIncomeList.innerHTML = expensesWithIncome.map(expense => {
        const hasSellingPrice = expense.selling_price_per_unit !== null && expense.selling_price_per_unit !== undefined;
        const sellingPriceDisplay = hasSellingPrice ? formatCurrency(expense.selling_price_per_unit) : '';
        
        return `
            <div class="expense-income-item">
                <div class="expense-income-info">
                    <div class="expense-income-header">
                        <span class="expense-income-name">${expense.name}</span>
                        <span class="expense-income-category" data-category="${expense.category}">${expense.category}</span>
                    </div>
                    <div class="expense-income-details">
                        <span>Menge: ${expense.quantity}</span>
                        <span>Kosten/Einheit: ${formatCurrency(expense.cost_per_unit)}</span>
                    </div>
                </div>
                <div class="expense-income-input">
                    <label>
                        Verkaufspreis pro Einheit:
                        <input type="text" 
                               class="selling-price-input" 
                               data-expense-id="${expense.id}"
                               value="${sellingPriceDisplay}"
                               placeholder="0,00 €"
                               inputmode="decimal">
                    </label>
                </div>
            </div>
        `;
    }).join('');
    
    // Setup EUR formatting and auto-save for selling price inputs
    document.querySelectorAll('.selling-price-input').forEach(input => {
        input.addEventListener('blur', async (e) => {
            const expenseId = parseInt(e.target.getAttribute('data-expense-id'));
            const sellingPrice = parseEURInput(e.target.value);
            
            // Format display
            const formatted = formatEURInput(e.target.value);
            if (formatted) {
                e.target.value = formatted;
            }
            
            // Auto-save if there's a valid price
            if (sellingPrice > 0) {
                await saveExpenseSellingPrice(expenseId, sellingPrice);
            } else if (e.target.value.trim() === '') {
                // If field is empty, set selling price to null
                await saveExpenseSellingPrice(expenseId, null);
            }
        });
        
        input.addEventListener('focus', (e) => {
            const value = e.target.value.replace(/[€\s]/g, '').trim();
            e.target.value = value;
        });
    });
}

// Save expense selling price
async function saveExpenseSellingPrice(expenseId, sellingPrice = null) {
    const input = document.querySelector(`.selling-price-input[data-expense-id="${expenseId}"]`);
    
    // If sellingPrice not provided, parse from input
    if (sellingPrice === null && input) {
        sellingPrice = parseEURInput(input.value);
        // If still 0 or invalid, set to null
        if (!sellingPrice || sellingPrice <= 0) {
            sellingPrice = null;
        }
    }
    
    try {
        const expense = eventData.expenses.find(e => e.id === expenseId);
        if (!expense) return;
        
        const response = await fetch(`/api/expenses/${expenseId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                category: expense.category,
                name: expense.name,
                quantity: expense.quantity,
                cost_per_unit: expense.cost_per_unit,
                selling_price_per_unit: sellingPrice
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            // Update expense in array
            const index = eventData.expenses.findIndex(e => e.id === expenseId);
            if (index !== -1) {
                eventData.expenses[index] = data;
            }
            // Update display and calculations
            displayExpensesIncomeList();
            updateCalculationsStep4();
        } else {
            console.error('Error saving selling price:', data.error);
            // Don't show alert on auto-save, just log error
        }
    } catch (error) {
        console.error('Error saving selling price:', error);
        // Don't show alert on auto-save, just log error
    }
}

// Display income without expense
function displayIncomeWithoutExpense() {
    const incomeList = document.getElementById('incomeWithoutExpenseList');
    
    if (!incomeList) return;
    
    if (eventData.incomeWithoutExpense.length === 0) {
        incomeList.innerHTML = '<p class="empty-message">Noch keine zusätzlichen Einnahmen hinzugefügt.</p>';
        return;
    }
    
    incomeList.innerHTML = eventData.incomeWithoutExpense.map(income => {
        const totalIncome = income.quantity * income.price_per_unit;
        
        return `
            <div class="income-item">
                <div class="income-info">
                    <div class="income-header">
                        <span class="income-name">${income.name}</span>
                    </div>
                    <div class="income-details">
                        <span>Menge: ${income.quantity}</span>
                        <span>Preis/Einheit: ${formatCurrency(income.price_per_unit)}</span>
                        <span>Gesamteinnahme: ${formatCurrency(totalIncome)}</span>
                    </div>
                </div>
                <div class="income-actions">
                    <button class="btn btn-danger btn-small" onclick="deleteIncomeWithoutExpense(${income.id})">Löschen</button>
                </div>
            </div>
        `;
    }).join('');
}

// Delete income without expense
async function deleteIncomeWithoutExpense(incomeId) {
    if (!confirm('Möchten Sie diese Einnahme wirklich löschen?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/income-without-expense/${incomeId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            eventData.incomeWithoutExpense = eventData.incomeWithoutExpense.filter(i => i.id !== incomeId);
            displayIncomeWithoutExpense();
            updateCalculationsStep4();
        } else {
            const data = await response.json();
            alert(data.error || 'Fehler beim Löschen');
        }
    } catch (error) {
        console.error('Error deleting income:', error);
        alert('Ein Fehler ist aufgetreten');
    }
}

// Update calculations for step 4
function updateCalculationsStep4() {
    const totalExpenses = eventData.expenses.reduce((sum, expense) => {
        return sum + (expense.quantity * expense.cost_per_unit);
    }, 0);
    
    // Income from expenses with selling price
    const incomeFromExpenses = eventData.expenses.reduce((sum, expense) => {
        if (expense.selling_price_per_unit === null || expense.selling_price_per_unit === undefined) {
            return sum;
        }
        return sum + ((expense.selling_price_per_unit - expense.cost_per_unit) * expense.quantity);
    }, 0);
    
    // Income without expenses
    const incomeWithoutExpenses = eventData.incomeWithoutExpense.reduce((sum, income) => {
        return sum + (income.quantity * income.price_per_unit);
    }, 0);
    
    const totalIncome = incomeFromExpenses + incomeWithoutExpenses;
    const profitLoss = totalIncome - totalExpenses;
    
    document.getElementById('totalExpensesStep4').textContent = formatCurrency(totalExpenses);
    document.getElementById('totalIncomeStep4').textContent = formatCurrency(totalIncome);
    
    const profitLossEl = document.getElementById('profitLossStep4');
    profitLossEl.textContent = formatCurrency(profitLoss);
    
    if (profitLoss >= 0) {
        profitLossEl.classList.add('positive');
        profitLossEl.classList.remove('negative');
    } else {
        profitLossEl.classList.add('negative');
        profitLossEl.classList.remove('positive');
    }
}

// Helper function
function formatCurrency(amount) {
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR'
    }).format(amount);
}

