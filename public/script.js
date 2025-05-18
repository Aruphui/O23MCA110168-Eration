// On page load, check if user is logged in
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");

  if (token && username) {
    showDashboard(username);
    loadSlots();
  } else {
    document.getElementById("auth").style.display = "block";
  }
});

// Show the registration form
function showRegister() {
  document.getElementById("loginForm").style.display = "none";
  document.getElementById("registrationForm").style.display = "block";
}

// Show the login form
function showLogin() {
  document.getElementById("loginForm").style.display = "block";
  document.getElementById("registrationForm").style.display = "none";
}

// Register new user
async function register() {
  const username = document.getElementById("reg-username").value.trim();
  const password = document.getElementById("reg-password").value.trim();
  const confirmPassword = document.getElementById("confirm-password").value.trim();

  if (!username || !password || !confirmPassword) {
    alert("All fields are required.");
    return;
  }

  if (password !== confirmPassword) {
    alert("Passwords do not match.");
    return;
  }

  const res = await fetch("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  alert(data.message || "Registered successfully!");
  if (data.success) {
    showLogin(); // Switch back to login form
  }
}

// Log in the user
async function login() {
  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  if (!username || !password) {
    alert("Please enter both username and password.");
    return;
  }

  const res = await fetch("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json();
  if (data.token) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("username", username);
    showDashboard(username);
    loadSlots();
  } else {
    alert(data.message || "Invalid login.");
  }
}

// Display the dashboard with welcome message
function showDashboard(username) {
  document.getElementById("auth").style.display = "none";
  document.getElementById("dashboard").style.display = "block";
  document.getElementById("welcomeUsername").textContent = username;
}

// Load available slots
async function loadSlots() {
  const token = localStorage.getItem("token");

  const res = await fetch("/slots", {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    alert("Failed to load slots.");
    return;
  }

  const data = await res.json();
  if (data.bookedSlot) {
    document.getElementById("bookedSlotDetails").textContent = data.bookedSlot.time_range;
  } else {
    displaySlots(data.slots);
  }
}

// Display available slots
function displaySlots(slots) {
  const slotList = document.getElementById("slotList");
  slotList.innerHTML = "";

  slots.forEach(slot => {
    const slotButton = document.createElement("button");
    slotButton.textContent = `${slot.time_range} - ${slot.current_count < slot.max_limit ? "Available" : "Full"}`;
    slotButton.className = "slot-button";
    slotButton.disabled = slot.current_count >= slot.max_limit;

    if (!slotButton.disabled) {
      slotButton.onclick = () => bookSlot(slot.id);
    }

    slotList.appendChild(slotButton);
  });
}

// Book a slot
async function bookSlot(slotId) {
  const token = localStorage.getItem("token");

  const res = await fetch("/book", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ slotId }),
  });

  const data = await res.json();
  alert(data.message);
  if (data.message === "Slot booked successfully.") loadSlots();
}

// Log out the user
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("username");
  location.reload();
}
