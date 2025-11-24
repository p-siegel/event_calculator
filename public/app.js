// Check authentication status on page load
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
});

// Check if user is authenticated
async function checkAuth() {
    try {
        const response = await fetch('/api/check-auth');
        const data = await response.json();
        
        if (data.authenticated) {
            // User is logged in
            if (window.location.pathname === '/login.html' || window.location.pathname === '/') {
                // Redirect to main page if on login page
                if (document.getElementById('usernameDisplay')) {
                    document.getElementById('usernameDisplay').textContent = data.username;
                }
                if (window.location.pathname === '/login.html' || window.location.pathname === '/') {
                    window.location.href = '/index.html';
                }
            } else {
                // Update username display on other pages
                if (document.getElementById('usernameDisplay')) {
                    document.getElementById('usernameDisplay').textContent = data.username;
                }
                // Load page-specific content
                if (window.location.pathname === '/index.html') {
                    loadEvents();
                }
            }
        } else {
            // User is not logged in
            if (window.location.pathname !== '/login.html' && window.location.pathname !== '/') {
                window.location.href = '/login.html';
            }
        }
    } catch (error) {
        console.error('Error checking auth:', error);
    }
}

// Login form handler
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorMessage = document.getElementById('errorMessage');
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                window.location.href = '/index.html';
            } else {
                errorMessage.textContent = data.error || 'Anmeldung fehlgeschlagen';
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error('Login error:', error);
            errorMessage.textContent = 'Ein Fehler ist aufgetreten';
            errorMessage.style.display = 'block';
        }
    });
}

// Logout handler
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/api/logout', {
                method: 'POST'
            });
            
            if (response.ok) {
                window.location.href = '/login.html';
            }
        } catch (error) {
            console.error('Logout error:', error);
        }
    });
}

// Load all events
async function loadEvents() {
    try {
        const response = await fetch('/api/events');
        const data = await response.json();
        
        if (response.ok) {
            displayEvents(data);
        } else {
            console.error('Error loading events:', data.error);
        }
    } catch (error) {
        console.error('Error loading events:', error);
    }
}

// Display events
function displayEvents(events) {
    const eventsList = document.getElementById('eventsList');
    
    if (!eventsList) return;
    
    if (events.length === 0) {
        eventsList.innerHTML = '<p class="empty-message">Noch keine Events vorhanden. Erstellen Sie ein neues Event.</p>';
        return;
    }
    
    eventsList.innerHTML = events.map(event => {
        return `
            <div class="event-card clickable" onclick="viewEvent(${event.id})">
                <div class="event-header">
                    <div class="event-title">${event.name}</div>
                    <div class="event-actions" onclick="event.stopPropagation()">
                        <button class="btn btn-danger btn-small" onclick="deleteEvent(${event.id})">Löschen</button>
                    </div>
                </div>
                <div class="event-details">
                    <div class="event-detail-item">
                        <span class="event-detail-label">Verantwortliche:</span>
                        <span class="event-detail-value">${event.responsible_count || 0}</span>
                    </div>
                    <div class="event-detail-item">
                        <span class="event-detail-label">Ausgaben:</span>
                        <span class="event-detail-value">${event.expense_count || 0}</span>
                    </div>
                    <div class="event-detail-item">
                        <span class="event-detail-label">Erstellt am:</span>
                        <span class="event-detail-value">${formatDate(event.created_at)}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// New event button handler
const newEventBtn = document.getElementById('newEventBtn');
if (newEventBtn) {
    newEventBtn.addEventListener('click', () => {
        window.location.href = '/event-wizard.html';
    });
}

// View event
function viewEvent(eventId) {
    window.location.href = `/event-wizard.html?eventId=${eventId}`;
}

// Delete event
async function deleteEvent(eventId) {
    if (!confirm('Möchten Sie dieses Event wirklich löschen? Alle zugehörigen Daten werden ebenfalls gelöscht.')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/events/${eventId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            loadEvents();
            showSuccessMessage('Event erfolgreich gelöscht');
        } else {
            showErrorMessage(data.error || 'Fehler beim Löschen des Events');
        }
    } catch (error) {
        console.error('Error deleting event:', error);
        showErrorMessage('Ein Fehler ist aufgetreten');
    }
}

// Helper functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('de-DE', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    });
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR'
    }).format(amount);
}

function showErrorMessage(message) {
    // Remove existing messages
    const existing = document.querySelector('.success-message, .error-message');
    if (existing && existing.parentElement) {
        existing.remove();
    }
    
    // Create and show error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    const main = document.querySelector('main');
    if (main) {
        main.insertBefore(errorDiv, main.firstChild);
        
        // Remove after 5 seconds
        setTimeout(() => {
            errorDiv.remove();
        }, 5000);
    }
}

function showSuccessMessage(message) {
    // Remove existing messages
    const existing = document.querySelector('.success-message, .error-message');
    if (existing && existing.parentElement) {
        existing.remove();
    }
    
    // Create and show success message
    const successDiv = document.createElement('div');
    successDiv.className = 'success-message';
    successDiv.textContent = message;
    
    const main = document.querySelector('main');
    if (main) {
        main.insertBefore(successDiv, main.firstChild);
        
        // Remove after 5 seconds
        setTimeout(() => {
            successDiv.remove();
        }, 5000);
    }
}

