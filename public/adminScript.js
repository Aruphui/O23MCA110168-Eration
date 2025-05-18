async function adminLogin() {
    const password = document.getElementById("adminPassword").value;
  
    const res = await fetch("/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
  
    const data = await res.json();
    if (data.token) {
      localStorage.setItem("adminToken", data.token);
      alert("Admin login successful!");
  
      // Redirect to admin dashboard
      loadDashboard(data.token);
    } else {
      alert(data.message || "Invalid admin login.");
    }
  }
  
  async function loadDashboard(token) {
    const res = await fetch("/admin/dashboard", {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` },
    });
  
    const dashboardData = await res.json();
    if (res.ok) {
      // Assuming the response contains a list of bookings
      document.getElementById("bookedSlots").style.display = "block";
      const slotList = document.getElementById("slotList");
      slotList.innerHTML = ""; // Clear existing entries
      dashboardData.bookings.forEach(booking => {
        const li = document.createElement("li");
        li.textContent = `${booking.username} - ${booking.time_range}`;
        slotList.appendChild(li);
      });
    } else {
      alert(dashboardData.message || "Failed to load dashboard.");
    }
  }
  