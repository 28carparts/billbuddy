// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyC_fcgI07cxvP26LVW8W3ZqrWwTa3fmvLw",
  authDomain: "perrybillbuddy.firebaseapp.com",
  databaseURL: "https://perrybillbuddy-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "perrybillbuddy",
  storageBucket: "perrybillbuddy.appspot.com",
  messagingSenderId: "380690422701",
  appId: "1:380690422701:web:17da1bb5f55f12f3625f24"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const database = firebase.database();
let currentTripRef;
let dataUnsubscribe;

// --- App State ---
let currentTripId = null;
let appData = {
    owner: null,
    groupEventName: '',
    buddies: [],
    expenses: [], // This will now hold both expense and divider objects
    adjustments: [],
    primaryCurrency: 'HKD'
};
let editingExpenseIndex = -1;
let isCalculatorResultShown = false;
let scrollToExpenseId = null; // Global variable to hold the ID of the expense to scroll to

// --- Exchange Rate State ---
const API_KEY = 'c86eace6da908459098e7518'; // This API key is publicly available.
const fallbackRates = { USD: 1, HKD: 7.8, CNY: 7.2, JPY: 157, EUR: 0.92, GBP: 0.79, KRW: 1380 };
let exchangeRates = {};

// --- DOM Elements ---
const authPage = document.getElementById('page-auth');
const noTripsPage = document.getElementById('page-no-trips');
const invitationConfirmPage = document.getElementById('page-invitation-confirm');
const appContent = document.getElementById('app-content');
const appNav = document.getElementById('app-nav');
const tripSwitcherBtn = document.getElementById('trip-switcher-btn');
const currentTripNameEl = document.getElementById('current-trip-name');
const loginContainer = document.getElementById('login-container');
const registerContainer = document.getElementById('register-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const forgotPasswordLink = document.getElementById('forgot-password');
const mealButtons = document.querySelectorAll('.meal-btn');
const currencyButtons = document.querySelectorAll('.currency-btn');
const addExpenseBtn = document.getElementById('add-expense');
const resetBtn = document.getElementById('reset');
const copyWhatsappBtn = document.getElementById('copy-whatsapp');
const addBuddyBtn = document.getElementById('add-buddy');
const newBuddyInput = document.getElementById('new-buddy');
const doneBuddiesBtn = document.getElementById('done-buddies');
const groupEventNameInput = document.getElementById('group-event-name');
const clearTripNameBtn = document.getElementById('clear-trip-name-btn');
const tripPrimaryCurrencySelect = document.getElementById('trip-primary-currency');
const expenseFormTitle = document.getElementById('expense-form-title');
const errorMsgElement = document.getElementById('error');
const navButtons = document.querySelectorAll('.nav-btn');
const selectAllBuddiesCheckbox = document.getElementById('select-all-buddies');
const adjustmentDebtorSelect = document.getElementById('adjustment-debtor');
const adjustmentCreditorSelect = document.getElementById('adjustment-creditor');
const tripSwitcherModal = document.getElementById('trip-switcher-modal');
const loggedInInfoDiv = document.getElementById('logged-in-info');
const loggedInEmailSpan = document.getElementById('logged-in-email');
const logoutLink = document.getElementById('logout-link');
const loggedInInfoNoTripsDiv = document.getElementById('logged-in-info-no-trips'); // Added for No Trips View
const loggedInEmailNoTripsSpan = document.getElementById('logged-in-email-no-trips'); // Added for No Trips View
const logoutLinkNoTrips = document.getElementById('logout-link-no-trips'); // Added for No Trips View
const closeIconBtn = document.getElementById('close-modal-icon-btn');
const calculatorInput = document.getElementById('calculator-input'); 
const adjustmentAmountInput = document.getElementById('adjustment-amount');
const clearCalculatorBtn = document.getElementById('clear-calculator-btn');
const mealRecordsContainer = document.getElementById('meal-records');
const addDayDividerBtn = document.getElementById('add-day-divider-btn');

// Universal Prompt/Confirmation Modal Elements
const universalPromptModal = document.getElementById('universal-prompt-modal');
const modalPromptTitle = document.getElementById('modal-prompt-title');
const modalPromptMessage = document.getElementById('modal-prompt-message');
const modalPromptInput = document.getElementById('modal-prompt-input');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalClearInputBtn = document.getElementById('modal-clear-input-btn');

// --- Initialize Swipers ---
function initSwipers() {
    new Swiper('#meal-swiper', {
        slidesPerView: 'auto',
        freeMode: true,
        mousewheel: true,
    });
    new Swiper('#currency-swiper', {
        slidesPerView: 'auto',
        freeMode: true,
        mousewheel: true,
    });
}

// Call initSwipers when the page loads
window.onload = initSwipers;

// --- Authentication Logic ---
auth.onAuthStateChanged(async user => {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedTripId = urlParams.get('shared');

    if (user) {
        // User is logged in
        authPage.classList.add('hidden');
        loggedInEmailSpan.textContent = user.email; 
        loggedInInfoDiv.classList.remove('hidden');

        loggedInEmailNoTripsSpan.textContent = user.email;
        loggedInInfoNoTripsDiv.classList.remove('hidden');
        
        if (sharedTripId) {
            await handleInvitation(sharedTripId, user);
        } else {
            await loadUserDashboard(user.uid);
        }
    } else {
        // User is not logged in
        if (currentTripRef && dataUnsubscribe) {
            currentTripRef.off('value', dataUnsubscribe); 
        }
        currentTripRef = null;
        dataUnsubscribe = null;
        currentTripId = null;
        
        // Hide all main content and show auth page
        appContent.classList.add('hidden');
        appNav.classList.add('hidden');
        noTripsPage.classList.add('hidden');
        invitationConfirmPage.classList.add('hidden');
        tripSwitcherBtn.classList.add('hidden');
        loggedInInfoDiv.classList.add('hidden'); 
        loggedInInfoNoTripsDiv.classList.add('hidden');
        
        authPage.classList.remove('hidden');

        // If there's a shared link, the login form will just show. 
        // After login, the logic will re-trigger to handle the invitation.
        
        appData = { owner: null, groupEventName: '', buddies: [], expenses: [], adjustments: [], primaryCurrency: 'HKD' };
        clearAllUI();
    }
});

async function handleInvitation(tripId, user) {
    try {
        const tripRef = database.ref(`trips/${tripId}`);
        const tripSnapshot = await tripRef.once('value');
        if (!tripSnapshot.exists()) {
            showError("This shared trip link is invalid or has been deleted.");
            window.history.replaceState({}, document.title, window.location.pathname);
            await loadUserDashboard(user.uid);
            return;
        }
        const tripData = tripSnapshot.val();

        // Check if user is already a member
        if (tripData.members && tripData.members[user.uid]) {
             showError("You're already a member of this trip!", 3000, 'success');
             window.history.replaceState({}, document.title, window.location.pathname);
             await loadTrip(tripId); // Directly load the trip
             return;
        }

        // Show confirmation page
        showInvitationConfirmation(tripData.groupEventName || "this trip", async () => {
            // On Confirm
            await joinTrip(tripId, user.uid, user.email);
            window.history.replaceState({}, document.title, window.location.pathname);
            await loadTrip(tripId);
        }, async () => {
            // On Cancel
            invitationConfirmPage.classList.add('hidden');
            window.history.replaceState({}, document.title, window.location.pathname);
            await loadUserDashboard(user.uid); // Load user's default dashboard
        });

    } catch (error) {
         showError(`Error handling invitation: ${error.message}`);
         window.history.replaceState({}, document.title, window.location.pathname);
         await loadUserDashboard(user.uid);
    }
}

function showInvitationConfirmation(tripName, onConfirm, onCancel) {
    const tripNameEl = document.getElementById('invitation-trip-name');
    const confirmBtn = document.getElementById('confirm-join-btn');
    const cancelBtn = document.getElementById('cancel-join-btn');
    const container = invitationConfirmPage.querySelector('div');

    tripNameEl.textContent = `"${tripName}"`;

    // Hide other pages
    authPage.classList.add('hidden');
    noTripsPage.classList.add('hidden');
    appContent.classList.add('hidden');
    appNav.classList.add('hidden');

    // Show invitation page
    invitationConfirmPage.classList.remove('hidden');
    requestAnimationFrame(() => {
         container.classList.remove('scale-95', 'opacity-0');
    });

    confirmBtn.onclick = onConfirm;
    cancelBtn.onclick = onCancel;
}


loginForm.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, password)
        .catch(error => showError(`Login Failed: ${error.message}`));
});

registerForm.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const confirmPassword = document.getElementById('register-password-confirm').value;

    if (password !== confirmPassword) {
        showError("Passwords do not match.");
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
        .catch(error => showError(`Registration Failed: ${error.message}`));
});

async function handlePasswordReset(e) {
    e.preventDefault();
    const email = await showPromptModal(
        '🔑 Reset Password', 
        'Please enter your email address. We will send you a link to reset your password.',
        document.getElementById('login-email').value, // Pre-fill with login email if available
        'your-email@example.com'
    );

    if (email) {
        auth.sendPasswordResetEmail(email)
            .then(() => {
                showError('Password reset email sent! Please check your inbox.', 5000, 'success');
            })
            .catch(error => {
                showError(`Error: ${error.message}`);
            });
    }
}

forgotPasswordLink.addEventListener('click', handlePasswordReset);

logoutLink.addEventListener('click', (e) => {
    e.preventDefault();
    closeTripSwitcherModal();
    auth.signOut();
});

// Event listener for logout link on No Trips View
logoutLinkNoTrips.addEventListener('click', (e) => {
    e.preventDefault();
    auth.signOut();
});


document.getElementById('show-register').addEventListener('click', e => {
    e.preventDefault();
    loginContainer.classList.add('hidden');
    registerContainer.classList.remove('hidden');
});

document.getElementById('show-login').addEventListener('click', e => {
    e.preventDefault();
    registerContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');
});

// --- Trip Management ---
async function loadUserDashboard(userId) {
    const userTripsRef = database.ref(`users/${userId}/trips`);
    const snapshot = await userTripsRef.once('value');
    const userTripIds = snapshot.val();

    if (userTripIds) {
        const lastTripId = localStorage.getItem('lastActiveTripId');
        const tripToLoad = userTripIds[lastTripId] ? lastTripId : Object.keys(userTripIds)[0];
        await loadTrip(tripToLoad);
    } else {
        // If there are no trips left for the user
        currentTripId = null;
        appContent.classList.add('hidden');
        appNav.classList.add('hidden');
        noTripsPage.classList.remove('hidden');
        tripSwitcherBtn.classList.add('hidden');
    }
}

async function loadTrip(tripId) {
    // Unsubscribe from previous trip's data listener
    if (currentTripRef && dataUnsubscribe) {
        currentTripRef.off('value', dataUnsubscribe);
    }
    currentTripId = tripId;
    localStorage.setItem('lastActiveTripId', tripId);
    currentTripRef = database.ref(`trips/${tripId}`);
    
    listenForDataChanges();
    
    // Show main app content, hide others
    appContent.classList.remove('hidden');
    appNav.classList.remove('hidden');
    tripSwitcherBtn.classList.remove('hidden');
    authPage.classList.add('hidden');
    noTripsPage.classList.add('hidden');
    invitationConfirmPage.classList.add('hidden');

    showPage('page-buddies'); // Default to buddies page on trip load
}

// Sets up a real-time listener for changes to the current trip data in Firebase
function listenForDataChanges() {
    if (currentTripRef) {
        dataUnsubscribe = currentTripRef.on('value', async (snapshot) => {
            const data = snapshot.val();
            const currentUser = auth.currentUser;

            // Case 1: Trip was deleted entirely
            if (!data) {
                console.log(`Trip ${currentTripId} was deleted.`);
                if (currentTripId === localStorage.getItem('lastActiveTripId')) {
                   localStorage.removeItem('lastActiveTripId');
                }
                currentTripRef.off('value', dataUnsubscribe);
                await loadUserDashboard(currentUser.uid);
                showError("The current trip has been deleted.", 3000, 'error');
                return;
            }

            // Case 2: Current user was removed from the trip
            if (currentUser && data.members && !data.members[currentUser.uid]) {
                console.log(`User ${currentUser.uid} was removed from trip ${currentTripId}.`);
                if (currentTripId === localStorage.getItem('lastActiveTripId')) {
                   localStorage.removeItem('lastActiveTripId');
                }
                currentTripRef.off('value', dataUnsubscribe);
                await loadUserDashboard(currentUser.uid);
                showError("You have been removed from the trip.", 4000, 'error');
                return; 
            }

            // Proceed with normal data update
            const oldCurrency = appData.primaryCurrency;
            const newCurrency = data.primaryCurrency || 'HKD';
            const shouldFetchRates = (oldCurrency !== newCurrency) || (Object.keys(exchangeRates).length === 0);

            // --- DATA MIGRATION ---
            // This ensures that older data without a 'type' property is correctly handled.
            let expenses = data.expenses || [];
            expenses = expenses.map((item, index) => {
                if (typeof item.type === 'undefined') {
                    return { ...item, type: 'expense', id: item.id || new Date(item.timestamp).getTime() || Date.now() + index };
                }
                return item;
            });


            appData = {
               owner: data.owner || null,
               members: data.members || {},
               groupEventName: data.groupEventName || '',
               buddies: data.buddies || [],
               expenses: expenses, // Use the migrated expenses array
               adjustments: data.adjustments || [],
               primaryCurrency: newCurrency
            };
            
            if (shouldFetchRates) {
                await fetchExchangeRates();
            } else {
                updateAllUI();
            }
        }, error => {
            console.error("Firebase data listener error:", error);
            showError("Error loading trip data.");
        });
    }
}

// Handles joining a trip via a shared link
async function joinTrip(tripId, userId, userEmail) {
    try {
        const memberData = { email: userEmail };
        // Add user to the trip's members list
        await database.ref(`trips/${tripId}/members`).update({ [userId]: memberData });
        // Add trip to the user's list of trips
        await database.ref(`users/${userId}/trips/${tripId}`).set(true);
        showError("Successfully joined the trip! 🎉", 3000, 'success');
    } catch (error) {
        showError(`Error joining trip: ${error.message}`);
    }
}

// Creates a new trip
async function createNewTrip() {
    const tripName = await showPromptModal("🚀 Trip Name", "What should we call your new adventure?", "", "My Awesome Trip");
    if (!tripName || !tripName.trim()) return; // If no name entered, exit

    const currentUser = auth.currentUser;
    if (!currentUser) {
        showError("You must be logged in to create a trip.");
        return;
    }

    const newTripRef = database.ref('trips').push(); // Generate a unique ID for the new trip
    const newTripId = newTripRef.key;

    const creatorName = currentUser.displayName || currentUser.email.split('@')[0] || 'Me';

    const initialTripData = {
        owner: currentUser.uid,
        members: { [currentUser.uid]: { email: currentUser.email } }, // Add creator as a member
        groupEventName: tripName.trim(),
        buddies: [creatorName], // Start with the creator as a buddy
        expenses: [],
        adjustments: [],
        primaryCurrency: 'HKD'
    };

    try {
        await newTripRef.set(initialTripData); // Save initial trip data
        await database.ref(`users/${currentUser.uid}/trips/${newTripId}`).set(true); // Link trip to user
        
        await loadTrip(newTripId); // Load the newly created trip
        
    } catch (error) {
        showError(`Failed to create trip: ${error.message}`);
    }
}

// Updates and populates the trip switcher modal with available trips
async function updateAndPopulateTripSwitcher() {
    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const userTripsRef = database.ref(`users/${currentUser.uid}/trips`);
    const snapshot = await userTripsRef.once('value');
    const userTripIds = snapshot.val();
    
    const menu = document.getElementById('trip-list-menu');
    menu.innerHTML = '';

    if (!userTripIds) {
        menu.innerHTML = '<p class="text-center text-sm text-slate-500 py-2">No trips found.</p>';
        return;
    }
    
    // Fetch details for each trip the user is part of
    const tripPromises = Object.keys(userTripIds).map(async (tripId) => {
        const tripDataSnapshot = await database.ref(`trips/${tripId}`).once('value');
        const tripData = tripDataSnapshot.val();
        if (!tripData) return null; // Skip if trip data doesn't exist
        return { 
            id: tripId, 
            name: tripData.groupEventName || 'Untitled Trip', 
            owner: tripData.owner,
            members: tripData.members || {}
        };
    });

    const trips = (await Promise.all(tripPromises)).filter(Boolean); // Filter out nulls

    trips.forEach(trip => {
        const isCurrentUserOwner = currentUser.uid === trip.owner;
        const ownedByLabel = isCurrentUserOwner ? ' (Owned)' : '';
        const memberIds = Object.keys(trip.members);
        
        const itemContainer = document.createElement('div');
        itemContainer.className = 'trip-list-item-container bg-slate-50 rounded-lg';

        const item = document.createElement('div');
        // Highlight the current active trip
        item.className = `flex justify-between items-center p-2.5 cursor-pointer hover:bg-sky-100/80 rounded-t-lg ${trip.id === currentTripId ? 'bg-sky-100 font-bold text-sky-600' : ''}`;
        
        item.innerHTML = `
            <span class="truncate pr-2">${trip.name}${ownedByLabel}</span>
            <div class="flex items-center gap-3 shrink-0">
                <button class="copy-trip-link-btn text-slate-500 hover:text-sky-500 transition-colors" data-trip-id="${trip.id}" aria-label="Copy link for ${trip.name}">
                    <i class="fas fa-clipboard text-base"></i>
                </button>
                <button class="toggle-members-btn text-slate-500 hover:text-sky-500 transition-colors" aria-label="Show members for ${trip.name}">
                    <i class="fas fa-chevron-down text-xs transition-transform duration-200"></i>
                </button>
            </div>
        `;
        
        item.onclick = async (event) => {
            // Only switch trip if the click wasn't on a button inside the item
            if (!event.target.closest('button')) {
                if (trip.id !== currentTripId) {
                    await loadTrip(trip.id);
                }
                closeTripSwitcherModal();
            }
        };

        const membersPanel = document.createElement('div');
        membersPanel.className = 'members-panel hidden bg-slate-100/70 p-3 mx-0.5 mb-0.5 rounded-b-md text-xs text-slate-700 space-y-1';
        
        if (memberIds.length > 0) {
            memberIds.forEach((memberId) => {
                const memberData = trip.members[memberId];
                const email = memberData.email;
                if (!email) return;

                const emailDiv = document.createElement('div');
                emailDiv.className = 'flex justify-between items-center p-1';
                
                let kickButton = '';
                // Only show kick button if current user is owner and member is not the owner
                if (isCurrentUserOwner && memberId !== trip.owner) {
                    kickButton = `<button class="kick-member-btn text-rose-500 hover:text-rose-700 transition-colors ml-2" 
                                    data-trip-id="${trip.id}" 
                                    data-member-id="${memberId}" 
                                    data-member-email="${email}"
                                    aria-label="Remove ${email}">
                                <i class="fas fa-user-slash text-sm"></i>
                            </button>`;
                }

                emailDiv.innerHTML = `<span class="truncate">${email}${memberId === trip.owner ? ' (Owner)' : ''}</span>${kickButton}`;
                membersPanel.appendChild(emailDiv);
            });
        } else {
            membersPanel.innerHTML = '<p class="text-slate-500 p-1">No members found.</p>';
        }

        // Add delete trip button for owner
        if(isCurrentUserOwner) {
            const deleteDiv = document.createElement('div');
            deleteDiv.className = 'border-t border-slate-200 mt-2 pt-2 text-center';
            deleteDiv.innerHTML = `
                <a href="#" class="delete-trip-btn text-rose-600 hover:text-rose-800 hover:underline text-xs font-semibold"
                   data-trip-id="${trip.id}"
                   data-trip-name="${trip.name}"
                   data-member-ids="${memberIds.join(',')}">
                   Delete Trip
                </a>`;
            membersPanel.appendChild(deleteDiv);
        }
        
        itemContainer.appendChild(item);
        itemContainer.appendChild(membersPanel);
        menu.appendChild(itemContainer);
    });
    attachTripSwitcherListeners();
}

// Attaches event listeners for trip switcher buttons (copy link, toggle members, kick member, delete trip)
function attachTripSwitcherListeners() {
    document.querySelectorAll('.copy-trip-link-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const tripIdToCopy = event.currentTarget.dataset.tripId;
            if (tripIdToCopy) {
                const shareLink = `${window.location.origin}${window.location.pathname}?shared=${tripIdToCopy}`;
                copyToClipboard(shareLink, "Trip invitation link copied! 🔗");
            }
        });
    });

    document.querySelectorAll('.toggle-members-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const itemContainer = btn.closest('.trip-list-item-container');
            const panel = itemContainer.querySelector('.members-panel');
            const icon = btn.querySelector('i');
            if (panel && icon) {
                panel.classList.toggle('hidden');
                icon.classList.toggle('rotate-180');
            }
        });
    });

    document.querySelectorAll('.kick-member-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const { tripId, memberId, memberEmail } = event.currentTarget.dataset;
            showConfirmation(`Are you sure you want to remove ${memberEmail} from this trip?`, () => {
                removeMemberFromTrip(tripId, memberId, memberEmail);
            });
        });
    });

    document.querySelectorAll('.delete-trip-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            const { tripId, tripName, memberIds } = event.currentTarget.dataset;
            deleteTrip(tripId, tripName, memberIds.split(','));
        });
    });
}

// Removes a member from a trip
async function removeMemberFromTrip(tripId, memberIdToRemove, memberEmail) {
    try {
        // Using a multi-path update for atomic operation
        const updates = {};
        updates[`/trips/${tripId}/members/${memberIdToRemove}`] = null;
        updates[`/users/${memberIdToRemove}/trips/${tripId}`] = null;

        await database.ref().update(updates);
        
        showError(`${memberEmail} has been removed from the trip.`, 3000, 'success');
        updateAndPopulateTripSwitcher(); // Refresh trip list in modal
    } catch(error) {
        showError(`Failed to remove member: ${error.message}`);
        console.error("Error removing member:", error);
    }
}

// Deletes a trip entirely
async function deleteTrip(tripId, tripName, memberIds) {
    showConfirmation(`Are you sure you want to permanently delete '${tripName}'? This action will remove the trip for ALL members and cannot be undone.`, () => {
        try {
            const updates = {};
            updates[`/trips/${tripId}`] = null; // Mark trip for deletion
            memberIds.forEach(userId => {
                updates[`/users/${userId}/trips/${tripId}`] = null; // Mark user's reference for deletion
            });
            
            database.ref().update(updates).then(async () => {
                showError(`Trip '${tripName}' has been deleted.`, 3000, 'success');
                closeTripSwitcherModal();

                // If the deleted trip was the current one, reload the dashboard
                if (tripId === currentTripId) {
                    localStorage.removeItem('lastActiveTripId');
                    currentTripId = null;
                    await loadUserDashboard(auth.currentUser.uid);
                } else {
                    await updateAndPopulateTripSwitcher(); // Just refresh the list
                }
            });
        } catch (error) {
            showError(`Failed to delete trip: ${error.message}`);
            console.error("Error deleting trip:", error);
        }
    });
}

// Opens the trip switcher modal
function openTripSwitcherModal() {
    updateAndPopulateTripSwitcher();
    tripSwitcherModal.classList.remove('hidden');
    requestAnimationFrame(() => { // Trigger animations after display change
        tripSwitcherModal.classList.remove('opacity-0');
        tripSwitcherModal.querySelector('#trip-switcher-modal-content').classList.remove('scale-95');
    });
}

// Closes the trip switcher modal
function closeTripSwitcherModal() {
    tripSwitcherModal.classList.add('opacity-0');
    tripSwitcherModal.querySelector('#trip-switcher-modal-content').classList.add('scale-95');
    setTimeout(() => tripSwitcherModal.classList.add('hidden'), 300); // Hide after animation
}

// Event listeners for trip switcher and related modals
tripSwitcherBtn.addEventListener('click', openTripSwitcherModal);
document.getElementById('close-trip-switcher-btn').addEventListener('click', closeTripSwitcherModal);
document.getElementById('create-new-trip-btn').addEventListener('click', () => {
    closeTripSwitcherModal();
    createNewTrip();
});
document.getElementById('create-first-trip-btn').addEventListener('click', createNewTrip);
if (closeIconBtn) { 
    closeIconBtn.addEventListener('click', closeTripSwitcherModal);
}

// Event listener for clearing modal prompt input
modalClearInputBtn.addEventListener('click', () => {
    if(modalPromptInput) {
        modalPromptInput.value = '';
        modalPromptInput.focus();
    }
});

// --- Database Logic ---
// Saves the current appData to Firebase
function saveDataToFirebase() {
    if (!currentTripRef) {
        // showError("No active trip reference to save data.");
        return;
    }
    // Only update the mutable parts of appData
    const dataToUpdate = {
        groupEventName: appData.groupEventName,
        buddies: appData.buddies,
        expenses: appData.expenses,
        adjustments: appData.adjustments,
        primaryCurrency: appData.primaryCurrency
    };
    
    currentTripRef.update(dataToUpdate)
       .catch(err => {
           console.error("Firebase update error:", err);
           showError(`Failed to save data: ${err.message}`);
       });
}

// --- Main App Logic ---
// Updates all UI components based on the current appData
function updateAllUI() {
    if (!currentTripId) return; // Exit if no trip is active
    
    groupEventNameInput.value = appData.groupEventName;
    tripPrimaryCurrencySelect.value = appData.primaryCurrency;
    currentTripNameEl.textContent = appData.groupEventName || 'Untitled Trip';
    updateCurrencyDisplays();
    updateBuddyList();
    updateSummary();
    updateMealRecords(); // Re-render meal records
    updateDebtSettlement();
    updateAdjustmentsDisplay();
    
    // Show/hide reset button based on ownership
    const isOwner = auth.currentUser && auth.currentUser.uid === appData.owner;
    resetBtn.style.display = isOwner ? 'flex' : 'none';
}

// Updates currency-related displays and headers
function updateCurrencyDisplays() {
    const currency = appData.primaryCurrency;
    document.getElementById('summary-title').innerHTML = `<span class="text-2xl sm:text-3xl">📊</span>Expense Summary (${currency})`;
    document.getElementById('debt-title').innerHTML = `<span class="text-2xl sm:text-3xl">🤝</span>Debt Settlement (${currency})`;
    
    document.getElementById('summary-total-owed-header').textContent = 'Total Owed';
    document.getElementById('debt-paid-header').textContent = 'Paid';
    document.getElementById('debt-owed-header').textContent = 'Owed';
    document.getElementById('debt-net-header').textContent = 'Net Balance';

    expenseFormTitle.innerHTML = `<span class="text-2xl sm:text-3xl">💸</span>Add New Expense`;
}

// Returns the common symbol for a given currency code
function getCurrencySymbol(currencyCode) {
    const symbols = { 'USD': '$', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'HKD': '$', 'CNY': '¥', 'KRW': '₩' };
    return symbols[currencyCode] || currencyCode;
}

// Clears all dynamic UI content
function clearAllUI() {
    document.getElementById('buddy-list').innerHTML = '';
    document.getElementById('summary-table').innerHTML = '';
    document.getElementById('meal-records').innerHTML = '';
    document.getElementById('debt-table').innerHTML = '';
    document.getElementById('settlement-plan').innerHTML = '';
    document.getElementById('current-adjustments').innerHTML = '';
}

// Fetches real-time exchange rates from an API or uses fallbacks
async function fetchExchangeRates() {
    const baseCurrency = appData.primaryCurrency;
    try {
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${baseCurrency}`);
        if (!response.ok) throw new Error(`API request failed: ${response.status}`);
        const data = await response.json();
        if (data.result === 'success' && data.conversion_rates) {
            exchangeRates = data.conversion_rates;
        } else {
             throw new Error(data['error-type'] || 'API request was not successful');
        }
    } catch (error) {
        console.error('Failed to fetch exchange rates:', error);
        showError(`API Error: ${error.message}. Using fallback rates.`, 5000);
        // Use fallback rates if API fails or returns error
        exchangeRates = {};
        const primaryInUsd = fallbackRates[baseCurrency];
        for (const key in fallbackRates) {
            exchangeRates[key] = fallbackRates[key] / primaryInUsd;
        }
    }
    updateAllUI(); // Update UI after rates are fetched/set
}

// Formats a timestamp string into a readable date and time
function formatTimestamp(dateString) {
    const date = new Date(dateString);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${dayName}, ${day} ${month} ${year}, ${hours}:${minutes}${ampm}`;
}

// Shows a specific page and updates navigation button styling
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
    const targetPage = document.getElementById(pageId);
    if (targetPage) targetPage.classList.remove('hidden');

    navButtons.forEach(btn => {
        const isActive = btn.dataset.page === pageId;
        btn.classList.toggle('text-sky-600', isActive);
        btn.classList.toggle('font-semibold', isActive);
        btn.classList.toggle('bg-sky-100', isActive);
        btn.classList.toggle('rounded-lg', isActive);
        btn.classList.toggle('text-slate-600', !isActive);
        if (!isActive) btn.classList.remove('bg-sky-100', 'rounded-lg');
    });
     // No immediate scroll to top here, let updateMealRecords handle if needed
}

// Event listeners for navigation buttons
navButtons.forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// Event listener for trip name input change
groupEventNameInput.addEventListener('change', () => {
    appData.groupEventName = groupEventNameInput.value.trim();
    saveDataToFirebase();
});

// Event listener for clearing trip name input
clearTripNameBtn.addEventListener('click', () => {
    if (groupEventNameInput.value) {
        groupEventNameInput.value = '';
        groupEventNameInput.dispatchEvent(new Event('change')); // Trigger change to save
        groupEventNameInput.focus();
    }
});

// Event listener for primary currency selection change
tripPrimaryCurrencySelect.addEventListener('change', () => {
    const newCurrency = tripPrimaryCurrencySelect.value;
    const oldCurrency = appData.primaryCurrency;

    // If the currency is the same, do nothing.
    if (newCurrency === oldCurrency) return;

    // Immediately revert the dropdown visually to the old currency
    tripPrimaryCurrencySelect.value = oldCurrency;
    
    const message = `All shared expenses will be settled in ${newCurrency}.`;
    showConfirmation(
        message, 
        () => { // onConfirm callback
            // Update the primary currency in Firebase. The listener will do the rest.
            currentTripRef.update({ primaryCurrency: newCurrency });
            showError(`Primary currency updated to ${newCurrency}.`, 3000, 'success');
        },
        { // Options for the modal
            title: 'Change Primary Currency?',
            confirmText: 'Confirm',
            confirmColor: 'bg-sky-500 hover:bg-sky-600' // Use a neutral blue for confirmation
        }
    );
});


// Event listeners for meal type buttons
mealButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        mealButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('meal-type').value = btn.dataset.meal;
    });
});

// Event listeners for currency buttons
currencyButtons.forEach(btn => {
    btn.addEventListener('click', () => {
        currencyButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('currency').value = btn.dataset.currency;
    });
});

// Updates the list of buddies and associated checkboxes/radio buttons
function updateBuddyList() {
    const buddyList = document.getElementById('buddy-list');
    const combinedBuddiesPayerContainer = document.getElementById('combined-buddies-payer');
    if(!buddyList || !combinedBuddiesPayerContainer) return;

    buddyList.innerHTML = '';
    combinedBuddiesPayerContainer.innerHTML = '';

    appData.buddies.forEach((buddy, index) => {
        const buddyId = `buddy_${index}_${buddy.replace(/\s+/g, '_')}`;
        const listItem = document.createElement('div');
        listItem.className = 'flex items-center justify-between bg-slate-50 p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow';
        listItem.innerHTML = `
            <span class="text-slate-800 font-medium text-sm sm:text-base">${buddy}</span>
            <div class="flex gap-2">
                <button class="edit-buddy bg-amber-400 text-white p-0 rounded-md hover:bg-amber-500 transition-colors text-lg flex items-center justify-center w-9 h-9" data-index="${index}" aria-label="Edit ${buddy}">✏️</button>
                <button class="delete-buddy bg-rose-500 text-white p-0 rounded-md hover:bg-rose-600 transition-colors text-lg flex items-center justify-center w-9 h-9" data-index="${index}" aria-label="Delete ${buddy}">🗑️</button>
            </div>`;
        buddyList.appendChild(listItem);

        const combinedItem = document.createElement('div');
        combinedItem.className = 'flex justify-between items-center bg-slate-50 p-2.5 rounded-md';
        combinedItem.innerHTML = `
            <label class="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" class="buddy custom-checkbox" value="${buddy}" id="exp_buddy_${buddyId}">
                <span class="text-sm text-slate-700">${buddy}</span>
            </label>
            <label class="flex items-center gap-3 cursor-pointer">
                <input type="radio" name="payer" class="payer custom-checkbox" value="${buddy}" id="payer_${buddyId}">
                <span class="text-sm text-slate-700">Paid</span>
            </label>`;
        combinedBuddiesPayerContainer.appendChild(combinedItem);
    });

    // Re-attach event listener for "select all" checkbox
    if (selectAllBuddiesCheckbox) {
        selectAllBuddiesCheckbox.removeEventListener('change', handleSelectAllBuddies);
        selectAllBuddiesCheckbox.addEventListener('change', handleSelectAllBuddies);
    }

    // Event listeners for edit and delete buddy buttons
    document.querySelectorAll('.edit-buddy').forEach(btn => {
        btn.addEventListener('click', async () => {
            const index = parseInt(btn.dataset.index);
            const currentName = appData.buddies[index];
            const newName = await showPromptModal(`✏️ Edit Buddy`, `Rename buddy "${currentName}" to:`, currentName);

            if (newName && newName.trim() && newName.trim() !== currentName) {
                if (appData.buddies.includes(newName.trim())) {
                    showError('Buddy name already exists.'); return;
                }
                if (newName.trim().length > 50) {
                    showError('Buddy name must be 50 characters or less.'); return;
                }
                const oldName = appData.buddies[index];
                appData.buddies[index] = newName.trim();
                // Update buddy name in existing expenses and adjustments
                appData.expenses.forEach(item => {
                    if (item.type === 'expense') {
                        item.buddies = item.buddies.map(p => p === oldName ? newName.trim() : p);
                        if (item.payer === oldName) item.payer = newName.trim();
                    }
                });
                appData.adjustments.forEach(adj => {
                    if (adj.debtor === oldName) adj.debtor = newName.trim();
                    if (adj.creditor === oldName) adj.creditor = newName.trim();
                });
                saveDataToFirebase();
                showError(`'${oldName}' renamed to '${newName.trim()}'`, 3000, 'success');
            }
        });
    });

    document.querySelectorAll('.delete-buddy').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            const buddyToDelete = appData.buddies[index];
            // Prevent deletion if buddy is involved in expenses or adjustments
            const isBuddyInvolved = appData.expenses.some(item => item.type === 'expense' && (item.buddies.includes(buddyToDelete) || item.payer === buddyToDelete));
            if (isBuddyInvolved) {
                showError(`Cannot delete ${buddyToDelete}. They are part of existing expenses.`, 5000); return;
            }
            if (appData.adjustments.some(adj => adj.debtor === buddyToDelete || adj.creditor === buddyToDelete)) {
                showError(`Cannot delete ${buddyToDelete}. They are involved in adjustments.`, 5000); return;
            }
            showConfirmation(`Are you sure you want to delete ${buddyToDelete}?`, () => {
                appData.buddies.splice(index, 1); // Remove buddy from array
                saveDataToFirebase();
                showError(`${buddyToDelete} has been deleted.`, 3000, 'success');
            });
        });
    });
}

// Handles "Select All Buddies" checkbox
function handleSelectAllBuddies() {
    const isChecked = selectAllBuddiesCheckbox.checked;
    document.querySelectorAll('#combined-buddies-payer .buddy').forEach(checkbox => checkbox.checked = isChecked);
}

// Event listener for adding a new buddy
addBuddyBtn.addEventListener('click', () => {
    const newName = newBuddyInput.value.trim();
    if (!newName) { showError('Please enter a buddy name.'); return; }
    if (appData.buddies.includes(newName)) { showError('Buddy already exists.'); return; }
    if (newName.length > 50) { showError('Buddy name must be 50 characters or less.'); return; }
    
    appData.buddies.push(newName);
    saveDataToFirebase();

    newBuddyInput.value = '';
    showError(`${newName} added successfully! ✨`, 3000, 'success');
});

// Event listener for "Done & Proceed" button on Buddies page
doneBuddiesBtn.addEventListener('click', () => {
    const eventName = groupEventNameInput.value.trim();
    if (!eventName) { showError('Please enter a trip name.'); return; }
    if (appData.buddies.length === 0) { showError('Please add at least one buddy.'); return; }
    
    appData.groupEventName = eventName;
    saveDataToFirebase();

    showPage('page-expense'); // Navigate to expense page
});

// Event listener for adding/updating an expense
addExpenseBtn.addEventListener('click', () => {
    if (!appData.groupEventName) {
        showError('Please set a trip name on the Buddies tab first.');
        showPage('page-buddies');
        return;
    }
    const mealType = document.getElementById('meal-type').value;
    const restaurant = document.getElementById('restaurant').value.trim();
    const currency = document.getElementById('currency').value;
    const amount = parseFloat(document.getElementById('amount').value);
    const selectedBuddies = Array.from(document.querySelectorAll('#combined-buddies-payer .buddy:checked')).map(cb => cb.value);
    const selectedPayerRadio = document.querySelector('#combined-buddies-payer .payer:checked');
    const selectedPayer = selectedPayerRadio ? selectedPayerRadio.value : null;

    // Input validation
    if (!mealType) { showError('Please select a meal type.'); return; }
    if (!restaurant) { showError('Please enter a place or item name.'); return; }
    if (!currency) { showError('Please select a currency.'); return; }
    if (isNaN(amount) || amount <= 0) { showError('Please enter a valid amount.'); return; }
    if (selectedBuddies.length === 0) { showError('Please select at least one buddy.'); return; }
    if (!selectedPayer) { showError('Please select who paid.'); return; }
    if (!selectedBuddies.includes(selectedPayer)) {
        showError('The payer must be one of the selected buddies.'); return;
    }
    // Convert amount to primary currency
    const amountInPrimaryCurrency = amount / (exchangeRates[currency] || 1); 

    const perBuddy = amountInPrimaryCurrency / selectedBuddies.length;

    const newExpense = {
        type: 'expense', // Explicitly set type
        id: editingExpenseIndex > -1 ? appData.expenses[editingExpenseIndex].id : Date.now(), // Use existing ID if editing
        mealType, restaurant, currency, amount, amountInPrimaryCurrency,
        buddies: selectedBuddies, perBuddy, payer: selectedPayer,
        timestamp: new Date().toISOString() // Store timestamp for sorting
    };

    // Set the ID of the expense to scroll to
    scrollToExpenseId = newExpense.id;

    if (editingExpenseIndex > -1) {
        appData.expenses[editingExpenseIndex] = newExpense; // Update existing expense
        showError('Expense updated successfully! ✨', 3000, 'success');
    } else {
        appData.expenses.push(newExpense); // Add new expense
        showError('Expense added successfully! 🎉', 3000, 'success');
    }
    editingExpenseIndex = -1; // Reset editing state
    // Reset button text and styling
    addExpenseBtn.innerHTML = '<span class="text-lg">🎉</span>Add Expense';
    addExpenseBtn.classList.remove('bg-amber-500', 'hover:bg-amber-600', 'active:bg-amber-700');
    addExpenseBtn.classList.add('bg-sky-500', 'hover:bg-sky-600', 'active:bg-sky-700');
    
    saveDataToFirebase();
    clearForm(); // Clear the expense form
    showPage('page-summary'); // Navigate to summary page (scroll will happen after updateAllUI)
});

// Event listener for resetting trip data
resetBtn.addEventListener('click', () => {
    showConfirmation('Are you sure you want to reset all expenses and adjustments for this trip? Buddies and trip name will not be changed.', () => {
        appData.expenses = [];
        appData.adjustments = [];
        saveDataToFirebase();
        showError('Trip data has been reset. 🚀', 3000, 'success');
        showPage('page-buddies');
    });
});

// Event listener for copying WhatsApp message
copyWhatsappBtn.addEventListener('click', () => {
    const whatsappText = generateWhatsAppMessage();
    copyToClipboard(whatsappText, "Data copied to clipboard! Ready to paste into WhatsApp. 📋");
});

// Updates the summary table
function updateSummary() {
    const summaryTableBody = document.getElementById('summary-table');
    if(!summaryTableBody) return;
    summaryTableBody.innerHTML = '';
    const totals = {};
    const details = {};
    const currencySymbol = getCurrencySymbol(appData.primaryCurrency);
    const lastDividerForBuddy = {};


    // Initialize totals and details for all buddies
    appData.buddies.forEach(buddy => {
        totals[buddy] = 0;
        details[buddy] = [];
        lastDividerForBuddy[buddy] = null;
    });

    // Calculate totals and populate details based on expenses
    let currentDividerLabel = null;
    appData.expenses.forEach(item => {
        if (item.type === 'divider') {
            currentDividerLabel = item.label;
            return; // Continue to the next item
        }
        
        // It's an expense item
        const exp = item;
        exp.buddies.forEach(buddy => {
            const perBuddyConverted = exp.perBuddy;
            totals[buddy] += perBuddyConverted;

            // Add the divider to the details view if it's the first time we've seen it for this buddy
            if (currentDividerLabel && lastDividerForBuddy[buddy] !== currentDividerLabel) {
                // Logic to remove top border for Day 1 divider
                const borderClass = (currentDividerLabel === 'Day 1') ? '' : 'pt-2 border-t border-slate-200 mt-2';
                details[buddy].push(`<div class="text-xs font-bold text-sky-700 ${borderClass}">${currentDividerLabel}</div>`);
                lastDividerForBuddy[buddy] = currentDividerLabel;
            }
            
            details[buddy].push(`<div class="text-xs"><span class="font-medium">${exp.mealType}</span> at ${exp.restaurant}: ${currencySymbol}${perBuddyConverted.toFixed(2)}</div>`);
        });
    });

    if (appData.buddies.length === 0) {
        const row = summaryTableBody.insertRow();
        row.innerHTML = `<td colspan="3" class="py-4 px-2 md:px-4 text-center text-slate-500">No buddies added yet.</td>`;
        return;
    }

    // Populate the summary table rows
    appData.buddies.forEach(buddy => {
        const row = summaryTableBody.insertRow();
        row.innerHTML = `
            <td class="py-3 px-2 md:px-4 text-slate-700 font-medium whitespace-normal">${buddy}</td>
            <td class="py-3 px-2 md:px-4 text-slate-700 whitespace-nowrap">${currencySymbol}${totals[buddy].toFixed(2)}</td>
            <td class="py-3 px-2 md:px-4 text-slate-700 space-y-1 whitespace-normal">${details[buddy].join('') || '<span class="text-slate-400">No expenses</span>'}</td>
        `;
    });
}

let draggedItem = null; // Stores the currently dragged DOM element

// Renumbers all day dividers sequentially
function renumberDayDividers() {
    let dayCounter = 1;
    appData.expenses.forEach(item => {
        if (item.type === 'divider') {
            item.label = `Day ${dayCounter}`;
            dayCounter++;
        }
    });
}

// Inserts a new day divider
addDayDividerBtn.addEventListener('click', () => {
    const dayDividersCount = appData.expenses.filter(item => item.type === 'divider').length;
    const newLabel = `Day ${dayDividersCount + 1}`;
    
    const newDivider = {
        type: 'divider',
        id: Date.now(),
        label: newLabel
    };

    if (dayDividersCount === 0) {
        // Add "Day 1" to the top
        appData.expenses.unshift(newDivider);
    } else {
        // Add "Day 2", "Day 3", etc., to the bottom
        appData.expenses.push(newDivider);
    }
    
    saveDataToFirebase();
    showError(`Added ${newLabel}`, 2000, 'success');
});


// Updates the meal records display with drag-and-drop functionality
function updateMealRecords() {
    const totalSpentElement = document.getElementById('total-spent');
    if(!totalSpentElement || !mealRecordsContainer) return;

    mealRecordsContainer.innerHTML = ''; // Clear existing records
    const expenseItems = appData.expenses.filter(item => item.type === 'expense');
    const total = expenseItems.reduce((sum, exp) => sum + exp.amountInPrimaryCurrency, 0);
    const count = expenseItems.length;
    totalSpentElement.textContent = `Total Spent: ${appData.primaryCurrency} ${total.toFixed(2)} | ${count} transaction${count !== 1 ? 's' : ''}`;

    if (appData.expenses.length === 0) {
        mealRecordsContainer.innerHTML = '<p class="text-slate-500 text-center py-4">No meal records yet. Add an expense! 🍽️</p>';
        scrollToExpenseId = null; 
        return;
    }

    let elementToScrollTo = null; // Store reference to the element to scroll to

    // Create and append meal record and divider elements
    appData.expenses.forEach((item) => {
        let div;
        if (item.type === 'divider') {
            div = document.createElement('div');
            div.className = 'day-divider-item record-list-item';
            div.draggable = true;
            div.dataset.id = item.id;
            div.innerHTML = `
                <span class="divider-label">${item.label}</span>
                <button class="delete-divider absolute top-2 right-2 bg-rose-100 text-rose-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-rose-200" data-id="${item.id}" aria-label="Delete divider">✖</button>
            `;
        } else if (item.type === 'expense') {
            const exp = item;
            div = document.createElement('div');
            div.className = 'meal-record-item record-list-item'; // Removed wrapper
            div.draggable = true;
            div.dataset.id = exp.id;
            const timestamp = formatTimestamp(exp.timestamp);
            div.innerHTML = `
                <div class="absolute top-2 right-2 flex gap-1">
                    <button class="edit-meal-record bg-sky-100 text-sky-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-sky-200" data-id="${exp.id}" aria-label="Edit meal record">✏️</button>
                    <button class="delete-meal-record bg-rose-100 text-rose-600 rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-rose-200" data-id="${exp.id}" aria-label="Delete meal record">✖</button>
                </div>
                <div class="flex justify-between items-start mb-1 pr-14">
                    <span class="font-semibold text-slate-800 text-sm">${exp.mealType} @ ${exp.restaurant}</span>
                    <span class="text-sky-600 font-bold text-sm">${exp.currency} ${exp.amount.toFixed(2)}</span>
                </div>
                <div class="text-xs">Paid by: <strong class="text-slate-700">${exp.payer}</strong></div>
                <div class="text-xs">Shared with: <em class="text-slate-500">${exp.buddies.join(', ')}</em></div>
                <div class="text-right text-slate-400 text-[10px] mt-1.5">${timestamp}</div>`;
        }
        
        if (div) {
             mealRecordsContainer.appendChild(div);
             if (item.id === scrollToExpenseId) {
                elementToScrollTo = div;
             }
        }
    });

    // After all items are appended, scroll to the desired element if found
    if (elementToScrollTo) {
        requestAnimationFrame(() => {
            elementToScrollTo.scrollIntoView({ behavior: 'smooth', block: 'center' });
            scrollToExpenseId = null; // Reset the global variable
        });
    }

    attachDragAndDropListeners();
    attachRecordActionListeners();
}

// Attaches drag and drop event listeners to meal record items
function attachDragAndDropListeners() {
    const recordListItems = document.querySelectorAll('.record-list-item');

    recordListItems.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.id); 
            setTimeout(() => item.classList.add('dragging'), 0);
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (item !== draggedItem) {
                item.classList.add('drag-over');
            }
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');

            if (draggedItem && draggedItem !== item) {
                const draggedId = Number(draggedItem.dataset.id);
                const targetId = Number(item.dataset.id);

                const draggedIndex = appData.expenses.findIndex(exp => exp.id === draggedId);
                let targetIndex = appData.expenses.findIndex(exp => exp.id === targetId);
                
                if (draggedIndex > -1 && targetIndex > -1) {
                    const [removed] = appData.expenses.splice(draggedIndex, 1);
                    // Adjust target index if the removed item was before it in the array
                    if (draggedIndex < targetIndex) {
                        targetIndex--; 
                    }
                    
                    // Check the position relative to the target element's midpoint
                    const rect = item.getBoundingClientRect();
                    const isAfter = e.clientY > rect.top + rect.height / 2;
                    if (isAfter) {
                        appData.expenses.splice(targetIndex + 1, 0, removed);
                    } else {
                        appData.expenses.splice(targetIndex, 0, removed);
                    }
                    
                    renumberDayDividers();
                    saveDataToFirebase();
                }
            }
        });

        item.addEventListener('dragend', () => {
            recordListItems.forEach(i => {
                i.classList.remove('dragging', 'drag-over');
            });
            draggedItem = null;
        });
    });
}

// Attaches listeners for edit/delete on records
function attachRecordActionListeners() {
    // Edit/Delete listeners
    document.querySelectorAll('.edit-meal-record').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const expenseId = Number(event.currentTarget.dataset.id);
            const indexToEdit = appData.expenses.findIndex(item => item.id === expenseId);
            if (indexToEdit > -1) editExpense(indexToEdit);
        });
    });

    document.querySelectorAll('.delete-meal-record').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const expenseId = Number(event.currentTarget.dataset.id);
            const expenseToDelete = appData.expenses.find(item => item.id === expenseId);
            
            if (expenseToDelete && expenseToDelete.type === 'expense') {
                const confirmationMessage = `Are you sure you want to delete the '${expenseToDelete.mealType} @ ${expenseToDelete.restaurant}' expense?`;
                showConfirmation(confirmationMessage, () => {
                    appData.expenses = appData.expenses.filter(item => item.id !== expenseId);
                    saveDataToFirebase();
                    showError('Expense deleted successfully!', 3000, 'success');
                });
            }
        });
    });

    document.querySelectorAll('.delete-divider').forEach(btn => {
         btn.addEventListener('click', (event) => {
            const dividerId = Number(event.currentTarget.dataset.id);
            const dividerToDelete = appData.expenses.find(item => item.id === dividerId);
            
            if (dividerToDelete) {
                const confirmationMessage = `Are you sure you want to delete the '${dividerToDelete.label}' divider?`;
                showConfirmation(confirmationMessage, () => {
                    appData.expenses = appData.expenses.filter(item => item.id !== dividerId);
                    renumberDayDividers();
                    saveDataToFirebase();
                    showError('Divider deleted.', 3000, 'success');
                });
            }
        });
    });
}

// Populates the expense form for editing an existing expense
function editExpense(index) {
    const expense = appData.expenses[index];
    if (!expense || expense.type !== 'expense') return; // Can only edit expenses
    editingExpenseIndex = index;

    document.getElementById('meal-type').value = expense.mealType;
    mealButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.meal === expense.mealType));
    document.getElementById('restaurant').value = expense.restaurant;
    document.getElementById('currency').value = expense.currency;
    currencyButtons.forEach(btn => btn.classList.toggle('active', btn.dataset.currency === expense.currency));
    document.getElementById('amount').value = expense.amount;
    
    // Reset and set selected buddies/payer
    document.querySelectorAll('#combined-buddies-payer .buddy').forEach(cb => cb.checked = false);
    document.querySelectorAll('#combined-buddies-payer .payer').forEach(radio => radio.checked = false);
    if (selectAllBuddiesCheckbox) selectAllBuddiesCheckbox.checked = false;

    expense.buddies.forEach(p => {
        const checkbox = document.querySelector(`#combined-buddies-payer .buddy[value="${p}"]`);
        if (checkbox) checkbox.checked = true;
    });
    const payerRadio = document.querySelector(`#combined-buddies-payer .payer[value="${expense.payer}"]`);
    if (payerRadio) payerRadio.checked = true;

    // Change button text and style for "Update" mode
    addExpenseBtn.innerHTML = '💾 Update Expense';
    addExpenseBtn.classList.remove('bg-sky-500', 'hover:bg-sky-600', 'active:bg-sky-700');
    addExpenseBtn.classList.add('bg-amber-500', 'hover:bg-amber-600', 'active:bg-amber-700');

    showPage('page-expense'); // Navigate to expense page
    window.scrollTo(0, 0); // Scroll to top
}

// Updates the debt settlement table and plan
function updateDebtSettlement() {
    const debtTableBody = document.getElementById('debt-table');
    const settlementPlanDiv = document.getElementById('settlement-plan');
    if(!debtTableBody || !settlementPlanDiv) return;

    debtTableBody.innerHTML = '';
    settlementPlanDiv.innerHTML = '';
    const currencySymbol = getCurrencySymbol(appData.primaryCurrency);

    const balances = {};
    // Initialize balances for all buddies
    appData.buddies.forEach(buddy => {
        balances[buddy] = { paid: 0, owed: 0, net: 0 };
    });

    // Calculate paid and owed from expenses
    appData.expenses.forEach(item => {
        if (item.type !== 'expense') return; // Skip dividers
        if (balances[item.payer]) balances[item.payer].paid += item.amountInPrimaryCurrency;
        item.buddies.forEach(buddy => {
            if(balances[buddy]) balances[buddy].owed += item.perBuddy;
        });
    });

    // Apply adjustments to net balances
    appData.adjustments.forEach(adj => {
        const amountInPrimary = adj.amount / (exchangeRates[adj.originalCurrency] || 1);
        if (balances[adj.debtor]) balances[adj.debtor].net -= amountInPrimary;
        if (balances[adj.creditor]) balances[adj.creditor].net += amountInPrimary;
    });

    // Calculate final net balance for each buddy
    appData.buddies.forEach(buddy => {
        balances[buddy].net = (balances[buddy].paid - balances[buddy].owed) + balances[buddy].net;
    });

    if (appData.buddies.length === 0) {
         debtTableBody.innerHTML = `<tr><td colspan="4" class="py-4 px-2 md:px-4 text-center text-slate-500">No buddies yet.</td></tr>`;
         settlementPlanDiv.innerHTML = '<p class="text-slate-500 text-center py-2">Add buddies and expenses to see settlements.</p>';
        return;
    }

    // Populate debt table
    appData.buddies.forEach(buddy => {
        const net = balances[buddy].net;
        const colorClass = net < -0.005 ? 'text-red-600 font-semibold' : net > 0.005 ? 'text-green-600 font-semibold' : 'text-slate-700';
        const row = debtTableBody.insertRow();
        row.innerHTML = `
            <td class="py-3 px-2 md:px-4 text-slate-700 font-medium whitespace-normal">${buddy}</td>
            <td class="py-3 px-2 md:px-4 text-slate-700 whitespace-nowrap">${currencySymbol}${balances[buddy].paid.toFixed(2)}</td>
            <td class="py-3 px-2 md:px-4 text-slate-700 whitespace-nowrap">${currencySymbol}${balances[buddy].owed.toFixed(2)}</td>
            <td class="py-3 px-2 md:px-4 whitespace-nowrap ${colorClass}">${currencySymbol}${net.toFixed(2)}</td>
        `;
    });

    // Calculate settlement plan
    const debtors = appData.buddies.filter(p => balances[p].net < -0.005).map(p => ({ name: p, amount: -balances[p].net }));
    const creditors = appData.buddies.filter(p => balances[p].net > 0.005).map(p => ({ name: p, amount: balances[p].net }));
    const settlements = [];

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const amountToSettle = Math.min(debtors[i].amount, creditors[j].amount);
        if (amountToSettle > 0.005) { // Only add if amount is significant
            settlements.push(`<span class="font-medium text-rose-600">${debtors[i].name}</span> pays <span class="font-medium text-emerald-600">${creditors[j].name}</span> <strong class="text-sky-700">${amountToSettle.toFixed(2)} ${appData.primaryCurrency}</strong>`);
            debtors[i].amount -= amountToSettle;
            creditors[j].amount -= amountToSettle;
        }
        if (debtors[i].amount < 0.005) i++; // Move to next debtor if settled
        if (creditors[j].amount < 0.005) j++; // Move to next creditor if settled
    }

    // Display settlement plan
    if (settlements.length === 0) {
        settlementPlanDiv.innerHTML = '<p class="text-green-600 font-medium text-center py-2">🎉 All debts are settled!</p>';
    } else {
        const ul = document.createElement('ul');
        ul.className = 'space-y-2';
        settlements.forEach(s => {
            const li = document.createElement('li');
            li.className = 'bg-sky-50 p-2.5 rounded-md text-sm shadow-sm border border-sky-100';
            li.innerHTML = s;
            ul.appendChild(li);
        });
        settlementPlanDiv.appendChild(ul);
    }
}

// Updates the display of individual adjustments
function updateAdjustmentsDisplay() {
    const container = document.getElementById('current-adjustments');
    if (!container || !adjustmentDebtorSelect || !adjustmentCreditorSelect) return;

    container.innerHTML = ''; // Clear existing adjustments
    // Populate dropdowns with current buddies
    adjustmentDebtorSelect.innerHTML = '<option value="">Select Payer</option>';
    adjustmentCreditorSelect.innerHTML = '<option value="">Select Receiver</option>';

    appData.buddies.forEach(p => {
        adjustmentDebtorSelect.add(new Option(p, p));
        adjustmentCreditorSelect.add(new Option(p, p));
    });

    filterCreditorDropdown(); // Filter creditor dropdown to prevent self-selection

    if (appData.adjustments.length === 0) {
        container.innerHTML = '<p class="text-slate-500 text-center py-2">No individual adjustments yet.</p>';
        return;
    }

    // Display each adjustment
    appData.adjustments.forEach((adj, index) => {
        const adjDiv = document.createElement('div');
        adjDiv.className = 'relative bg-white p-3.5 rounded-lg shadow-sm border border-slate-200 text-sm flex justify-between items-center';
        const amountInPrimary = adj.amount / (exchangeRates[adj.originalCurrency] || 1);
        
        const displayAmount = `<strong class="text-sky-700">${adj.originalCurrency} ${adj.amount.toFixed(2)}</strong> 
                             <span class="text-slate-500 text-xs">(~${amountInPrimary.toFixed(2)} ${appData.primaryCurrency})</span>`;

        adjDiv.innerHTML = `
            <span class="flex-grow flex flex-wrap items-center gap-x-2">
                <strong class="text-rose-600">${adj.debtor}</strong> pays <strong class="text-emerald-600">${adj.creditor}</strong> ${displayAmount}
            </span>
            <button class="delete-adjustment-btn bg-rose-100 text-rose-600 rounded-full w-6 h-6 flex items-center justify-center font-bold hover:bg-rose-200 shrink-0 ml-2" data-index="${index}">✖</button>
        `;
        container.appendChild(adjDiv);
    });

    // Attach delete listeners for adjustments
    document.querySelectorAll('.delete-adjustment-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const indexToDelete = parseInt(event.currentTarget.dataset.index);
            const adjToDelete = appData.adjustments[indexToDelete];
            if (adjToDelete) {
                const confirmationMessage = `Are you sure you want to remove the '${adjToDelete.debtor} pays ${adjToDelete.creditor}' adjustment?`;
                showConfirmation(confirmationMessage, () => {
                    appData.adjustments.splice(indexToDelete, 1);
                    saveDataToFirebase();
                    showError('Adjustment removed.', 3000, 'success');
                });
            }
        });
    });
}

// Event listener for adding a new adjustment
document.getElementById('add-adjustment-btn').addEventListener('click', () => {
    const debtor = adjustmentDebtorSelect.value;
    const creditor = adjustmentCreditorSelect.value;
    const currency = document.getElementById('adjustment-currency').value;
    const amount = parseFloat(adjustmentAmountInput.value);

    // Input validation
    if (!debtor || !creditor || !currency || isNaN(amount) || amount <= 0) {
        showError('Please select payer, receiver, currency, and a valid amount.'); return;
    }
    if (debtor === creditor) {
        showError('Payer and Receiver cannot be the same buddy.'); return;
    }
    
    appData.adjustments.push({ debtor, creditor, amount: amount, originalCurrency: currency });
    saveDataToFirebase();
    
    // Clear form fields after adding adjustment
    adjustmentAmountInput.value = '';
    calculatorInput.innerHTML = '';
    isCalculatorResultShown = false;
    adjustmentDebtorSelect.value = '';
    adjustmentCreditorSelect.value = '';
    filterCreditorDropdown(); // Re-filter dropdowns
    showError('Adjustment added successfully!', 3000, 'success');
});

// Filters the creditor dropdown to prevent selecting the same buddy as debtor
function filterCreditorDropdown() {
    const selectedDebtor = adjustmentDebtorSelect.value;
    const currentCreditor = adjustmentCreditorSelect.value;
    let creditorIsValid = false;

    Array.from(adjustmentCreditorSelect.options).forEach(option => {
        option.style.display = (option.value === selectedDebtor && selectedDebtor !== "") ? 'none' : '';
        if (option.value === currentCreditor && option.style.display !== 'none') {
            creditorIsValid = true;
        }
    });

    if (!creditorIsValid) adjustmentCreditorSelect.value = ""; // Reset if current selection is now invalid
}

// Event listener for debtor selection change to update creditor dropdown
adjustmentDebtorSelect.addEventListener('change', filterCreditorDropdown);

// Generates the WhatsApp message summary
function generateWhatsAppMessage() {
    let message = `*💰 ${appData.groupEventName || 'Group Event'} Recap* \n\n`;
    const primaryCurrency = appData.primaryCurrency;
    const expenseItems = appData.expenses.filter(item => item.type === 'expense');

    const balances = {};
    appData.buddies.forEach(buddy => {
        balances[buddy] = { paid: 0, owed: 0, net: 0 };
    });
    expenseItems.forEach(exp => {
        if (balances[exp.payer]) balances[exp.payer].paid += exp.amountInPrimaryCurrency;
        exp.buddies.forEach(buddy => {
            if(balances[buddy]) balances[buddy].owed += exp.perBuddy;
        });
    });
     appData.adjustments.forEach(adj => {
        const amountInPrimary = adj.amount / (exchangeRates[adj.originalCurrency] || 1);
        if (balances[adj.debtor]) balances[adj.debtor].net -= amountInPrimary;
        if (balances[adj.creditor]) balances[adj.creditor].net += amountInPrimary;
    });
    appData.buddies.forEach(buddy => {
        balances[buddy].net = (balances[buddy].paid - balances[buddy].owed) + balances[buddy].net;
    });

    message += `*📊 Net Balance Summary (${primaryCurrency})*\n`;
    if (appData.buddies.length > 0) {
        appData.buddies.forEach(buddy => {
            const netBalance = balances[buddy].net;
            if (netBalance < -0.005) {
                message += `• *${buddy}* pays ${primaryCurrency} ${(-netBalance).toFixed(2)}\n`;
            } else if (netBalance > 0.005) {
                message += `• *${buddy}* receives ${primaryCurrency} ${netBalance.toFixed(2)}\n`;
            }
        });
    } else {
        message += `_No buddies added yet._\n`;
    }
    message += `\n`;

    message += `*🧾 Meal Records*\n`;
    if (appData.expenses.length > 0) {
        const total = expenseItems.reduce((sum, exp) => sum + exp.amountInPrimaryCurrency, 0);
        message += `Total Spent: *${primaryCurrency} ${total.toFixed(2)}* | ${expenseItems.length} transaction${expenseItems.length !== 1 ? 's' : ''}\n\n`;
        
        appData.expenses.forEach((item, index, arr) => {
            if (item.type === 'divider') {
                message += `\n*--- ${item.label} ---*\n`;
            } else { // It's an expense
                const exp = item;
                message += `• ${exp.mealType} @ ${exp.restaurant}: *${exp.currency} ${exp.amount.toFixed(2)}*\n`;
                message += `  Paid by: *${exp.payer}*\n`;
                message += `  Shared with: _${exp.buddies.join(', ')}_\n`;
                 // Check if the next item is also an expense to add a separator
                const nextItem = arr[index + 1];
                if (nextItem && nextItem.type === 'expense') {
                     message += `--------------------------------------\n`;
                }
            }
        });
    } else {
        message += `_No meal records yet._\n`;
    }
    message += `\n`;

    if (appData.adjustments.length > 0) {
        message += `*💱 Individual Adjustments:*\n`;
        appData.adjustments.forEach(adj => {
             const amountInPrimary = adj.amount / (exchangeRates[adj.originalCurrency] || 1);
            const adjAmountStr = `*${adj.originalCurrency} ${adj.amount.toFixed(2)}* (~${amountInPrimary.toFixed(2)} ${primaryCurrency})`;
            message += `• *${adj.debtor}* pays *${adj.creditor}* ${adjAmountStr}\n`;
        });
        message += `\n`;
    }

    message += `*🤝 Debt Settlement*\n`;
    
    // Calculate and append settlement plan
    const debtors = appData.buddies.filter(p => balances[p].net < -0.005).map(p => ({ name: p, amount: -balances[p].net }));
    const creditors = appData.buddies.filter(p => balances[p].net > 0.005).map(p => ({ name: p, amount: balances[p].net }));
    const settlements = [];

    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const amountToSettle = Math.min(debtors[i].amount, creditors[j].amount);
        if (amountToSettle > 0.005) {
            settlements.push(`* *${debtors[i].name}* pays *${creditors[j].name}* *${amountToSettle.toFixed(2)} ${primaryCurrency}*`);
            debtors[i].amount -= amountToSettle;
            creditors[j].amount -= amountToSettle;
        }
        if (debtors[i].amount < 0.005) i++;
        if (creditors[j].amount < 0.005) j++;
    }

    if (settlements.length === 0) {
        message += `_🎉 All debts are settled!_\n`;
    } else {
        message += `_Settlement Plan:_\n`;
        message += settlements.join('\n') + '\n';
    }
    
    message += `\n🐾 _Generated by Bill Buddy_ 🐾`;
    return message;
}

// --- Utility Functions ---
let errorTimeout;
// Displays an error or success message
function showError(message, duration = 4000, type = 'error') {
    if (!errorMsgElement) return;
    clearTimeout(errorTimeout);
    errorMsgElement.textContent = message;
    // Reset classes before adding new ones
    errorMsgElement.classList.remove('opacity-0', 'bg-red-100', 'text-red-700', 'border-red-300', 'bg-green-100', 'text-green-700', 'border-green-300');
    errorMsgElement.classList.add('opacity-0'); 
    requestAnimationFrame(() => { // Use rAF for smooth transition
         errorMsgElement.classList.add(type === 'success' ? 'bg-green-100' : 'bg-red-100', type === 'success' ? 'text-green-700' : 'text-red-700', type === 'success' ? 'border-green-300' : 'border-red-300');
         errorMsgElement.classList.remove('opacity-0');
    });
    errorTimeout = setTimeout(() => errorMsgElement.classList.add('opacity-0'), duration);
}

// Shows a flexible confirmation modal
function showConfirmation(message, onConfirm, options = {}) {
    const {
        title = 'Are you sure?',
        confirmText = 'Confirm',
        cancelText = 'Cancel',
        confirmColor = 'bg-rose-500 hover:bg-rose-600' // Default to red for destructive actions
    } = options;

    const modalId = 'confirmation-modal';
    let modal = document.getElementById(modalId);
    if (modal) modal.remove(); // Remove existing modal to ensure clean state
    
    modal = document.createElement('div');
    modal.id = modalId;
    modal.className = 'fixed inset-0 bg-gray-900 bg-opacity-75 flex items-center justify-center z-[200] p-4 transition-opacity duration-300 opacity-0';
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-xl p-6 sm:p-8 space-y-5 w-full max-w-sm transform scale-95 transition-all duration-300">
            <h3 class="text-xl font-bold text-center text-slate-800" id="confirmation-title"></h3>
            <p class="text-slate-600 text-center text-sm" id="confirmation-message"></p>
            <div class="flex justify-center gap-3 pt-2">
                <button id="cancel-btn" class="px-5 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 font-semibold transition-colors">${cancelText}</button>
                <button id="confirm-btn" class="px-5 py-2 text-white rounded-lg font-semibold transition-colors ${confirmColor}">${confirmText}</button>
            </div>
        </div>`;
    document.body.appendChild(modal);

    document.getElementById('confirmation-title').textContent = title;
    document.getElementById('confirmation-message').textContent = message;
    
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modal.querySelector('div').classList.remove('scale-95');
    });
    
    const confirmBtn = document.getElementById('confirm-btn');
    const cancelBtn = document.getElementById('cancel-btn');
    const cleanup = () => { 
        modal.classList.add('opacity-0');
        modal.querySelector('div').classList.add('scale-95');
        setTimeout(() => {
            if (modal) modal.remove(); 
        }, 300);
     };
    confirmBtn.onclick = () => { onConfirm(); cleanup(); };
    cancelBtn.onclick = cleanup;
}

// Shows a prompt modal for user input
function showPromptModal(title, message, defaultValue = '', placeholder = 'Enter name here') {
    return new Promise(resolve => {
        modalPromptTitle.innerHTML = title;
        modalPromptMessage.textContent = message;
        modalPromptInput.value = defaultValue;
        modalPromptInput.placeholder = placeholder;
        universalPromptModal.classList.remove('hidden');
        requestAnimationFrame(() => {
            universalPromptModal.classList.remove('opacity-0');
            universalPromptModal.querySelector('div').classList.remove('scale-95');
            modalPromptInput.focus();
            modalPromptInput.select();
        });

        const cleanup = (value) => {
            universalPromptModal.classList.add('opacity-0');
            universalPromptModal.querySelector('div').classList.add('scale-95');
            setTimeout(() => {
                universalPromptModal.classList.add('hidden');
                modalConfirmBtn.onclick = null;
                modalCancelBtn.onclick = null;
                resolve(value);
            }, 300);
        };

        modalConfirmBtn.onclick = () => cleanup(modalPromptInput.value.trim());
        modalCancelBtn.onclick = () => cleanup(null);
        modalPromptInput.onkeydown = (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                cleanup(modalPromptInput.value.trim());
            }
        };
    });
}

// Safely evaluates a mathematical expression string
function safeEvaluate(expression) {
    try {
        // Basic validation to prevent arbitrary code execution
        if (!/^[0-9\s\.\+\-\*\/\(\)]+$/.test(expression)) {
            throw new Error("Invalid characters in expression.");
        }
        const result = new Function('return ' + expression)();
        if (typeof result !== 'number' || !isFinite(result)) {
            throw new Error("Invalid calculation result.");
        }
        return result;
    } catch (error) {
        console.error("Evaluation error:", error);
        showError(error.message, 3000, 'error');
        return null;
    }
}

// Event listener for calculator input (Enter key for evaluation)
calculatorInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { 
        event.preventDefault(); // Prevent new line in contenteditable
        const expression = calculatorInput.textContent.trim();
        if (!expression) return;
        
        const result = safeEvaluate(expression);
        
        if (result !== null) {
            const formattedResult = Number(result.toFixed(2));
            adjustmentAmountInput.value = formattedResult;
            calculatorInput.innerHTML = `${expression} = <strong class="text-indigo-600 font-bold">${formattedResult}</strong>`;
            isCalculatorResultShown = true;
            
            // Move cursor to end of contenteditable div
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(calculatorInput);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }
});

// Event listener for calculator input to clear result on new input
calculatorInput.addEventListener('input', () => {
    if (isCalculatorResultShown) {
        adjustmentAmountInput.value = '';
        isCalculatorResultShown = false;
    }
});

// Event listener for clearing calculator input
clearCalculatorBtn.addEventListener('click', () => {
    calculatorInput.innerHTML = '';
    adjustmentAmountInput.value = '';
    isCalculatorResultShown = false;
    calculatorInput.focus();
});


// Clears the expense form fields
function clearForm() {
    document.getElementById('meal-type').value = '';
    document.getElementById('restaurant').value = '';
    document.getElementById('currency').value = '';
    document.getElementById('amount').value = '';
    // Uncheck all buddy checkboxes and payer radio buttons
    document.querySelectorAll('#combined-buddies-payer .buddy:checked').forEach(cb => cb.checked = false);
    const payerRadio = document.querySelector('#combined-buddies-payer .payer:checked');
    if(payerRadio) payerRadio.checked = false;
    if (selectAllBuddiesCheckbox) selectAllBuddiesCheckbox.checked = false;
    // Deactivate meal and currency buttons
    mealButtons.forEach(b => b.classList.remove('active'));
    currencyButtons.forEach(b => b.classList.remove('active'));
    if(calculatorInput) calculatorInput.innerHTML = '';
    isCalculatorResultShown = false;
}

// Copies text to clipboard
function copyToClipboard(text, successMessage) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed'; textarea.style.opacity = 0; // Hide textarea
    document.body.appendChild(textarea);
    textarea.focus(); textarea.select();
    try {
        document.execCommand('copy'); // Use execCommand for broader compatibility in iframes
        showError(successMessage, 3000, 'success');
    } catch (err) {
        showError('Failed to copy data.', 3000, 'error');
    }
    document.body.removeChild(textarea);
}
