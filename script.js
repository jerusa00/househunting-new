
const API_URL = "https://househunting-new.onrender.com";

let houses = [];
let homeMap = null;
let listingMap = null;
let detailsMap = null;
let listingMarker = null;
let detailsMarker = null;
let selectedLatitude = null;
let selectedLongitude = null;

// Keep the email being used for verification and password recovery
let currentVerificationEmail = "";
let currentResetEmail = "";

// Get saved login information
function getToken() {
    return localStorage.getItem("houseHuntingToken");
}

function getUser() {
    try {
        return JSON.parse(localStorage.getItem("houseHuntingUser"));
    } catch {
        return null;
    }
}

// Escape text before placing it into HTML
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

// Show messages
function showMessage(elementId, message, type = "") {
    const element = document.getElementById(elementId);

    if (!element) return;

    element.textContent = message;
    element.className = "message " + type;
}

// API requests
async function apiRequest(endpoint, options = {}) {
    const headers = { ...(options.headers || {}) };

    if (getToken()) {
        headers.Authorization = `Bearer ${getToken()}`;
    }

    if (options.body && !(options.body instanceof FormData)) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(API_URL + endpoint, {
        ...options,
        headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
    }

    return data;
}

// Modal controls
function openModal(id) {
    const modal = document.getElementById(id);

    if (modal) {
        modal.classList.add("show");
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);

    if (modal) {
        modal.classList.remove("show");
    }
}

function closeAllModals() {
    document.querySelectorAll(".modal").forEach(modal => {
        modal.classList.remove("show");
    });
}

// Update navigation depending on login status
function updateNavigation() {
    const user = getUser();

    document.getElementById("authButtons").hidden = !!user;
    document.getElementById("userButtons").hidden = !user;

    document.getElementById("listPropertyLink").hidden =
        !user || !["agent", "landlord"].includes(user.role);

    document.getElementById("welcomeUser").textContent =
        user ? `Welcome, ${user.name}` : "";

    document.getElementById("list-property").hidden =
        !user || !["agent", "landlord"].includes(user.role);
}

// ===============================
// REGISTRATION
// ===============================

document.getElementById("registerForm").addEventListener("submit", async event => {
    event.preventDefault();

    const userData = {
        name: document.getElementById("registerName").value.trim(),
        email: document.getElementById("registerEmail").value.trim().toLowerCase(),
        phone: document.getElementById("registerPhone").value.trim(),
        password: document.getElementById("registerPassword").value,
        role: document.getElementById("accountType").value
    };

    try {
        showMessage("registerMessage", "Creating your account...");

        const result = await apiRequest("/api/register", {
            method: "POST",
            body: JSON.stringify(userData)
        });

        currentVerificationEmail = userData.email;

        document.getElementById("verificationEmail").value =
            currentVerificationEmail;

        document.getElementById("registerForm").reset();

        showMessage(
            "registerMessage",
            result.message || "Account created. Please verify your email.",
            "success"
        );

        setTimeout(() => {
            closeModal("registerModal");
            openModal("verificationModal");

            showMessage(
                "verificationMessage",
                "Enter the verification code sent to your email."
            );
        }, 700);

    } catch (error) {
        showMessage("registerMessage", error.message, "error");
    }
});

// ===============================
// EMAIL VERIFICATION
// ===============================

document.getElementById("verificationForm").addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("verificationEmail").value
        .trim()
        .toLowerCase();

    const code = document.getElementById("verificationCode").value.trim();

    try {
        showMessage("verificationMessage", "Verifying your email...");

        const result = await apiRequest("/api/verify-email", {
            method: "POST",
            body: JSON.stringify({
                email,
                code
            })
        });

        showMessage(
            "verificationMessage",
            result.message || "Your email has been verified successfully!",
            "success"
        );

        currentVerificationEmail = email;

        setTimeout(() => {
            closeModal("verificationModal");
            document.getElementById("loginEmail").value = email;
            openModal("loginModal");
            showMessage(
                "loginMessage",
                "Email verified. You can now log in.",
                "success"
            );
        }, 1200);

    } catch (error) {
        showMessage("verificationMessage", error.message, "error");
    }
});

// Resend verification code
document.getElementById("resendVerificationButton").addEventListener("click", async () => {
    const email = document.getElementById("verificationEmail").value
        .trim()
        .toLowerCase();

    if (!email) {
        showMessage(
            "resendVerificationMessage",
            "Please enter your email address.",
            "error"
        );
        return;
    }

    try {
        showMessage("resendVerificationMessage", "Sending another code...");

        const result = await apiRequest("/api/resend-verification", {
            method: "POST",
            body: JSON.stringify({ email })
        });

        showMessage(
            "resendVerificationMessage",
            result.message || "A new verification code has been sent.",
            "success"
        );

    } catch (error) {
        showMessage("resendVerificationMessage", error.message, "error");
    }
});

// ===============================
// LOGIN
// ===============================

document.getElementById("loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    const loginData = {
        email: document.getElementById("loginEmail").value.trim().toLowerCase(),
        password: document.getElementById("loginPassword").value
    };

    try {
        showMessage("loginMessage", "Logging in...");

        const result = await apiRequest("/api/login", {
            method: "POST",
            body: JSON.stringify(loginData)
        });

        localStorage.setItem("houseHuntingToken", result.token);
        localStorage.setItem("houseHuntingUser", JSON.stringify(result.user));

        showMessage("loginMessage", "Login successful!", "success");

        document.getElementById("loginForm").reset();

        updateNavigation();

        setTimeout(() => {
            closeModal("loginModal");
            loadHouses();
        }, 800);

    } catch (error) {
        showMessage("loginMessage", error.message, "error");
    }
});

// ===============================
// FORGOT PASSWORD
// ===============================

document.getElementById("forgotPasswordLink").addEventListener("click", () => {
    const loginEmail = document.getElementById("loginEmail").value.trim();

    document.getElementById("forgotEmail").value = loginEmail;

    closeModal("loginModal");
    openModal("forgotPasswordModal");
});

// Request password reset code
document.getElementById("forgotPasswordForm").addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("forgotEmail").value
        .trim()
        .toLowerCase();

    try {
        showMessage("forgotPasswordMessage", "Requesting password reset...");

        const result = await apiRequest("/api/forgot-password", {
            method: "POST",
            body: JSON.stringify({ email })
        });

        currentResetEmail = email;

        document.getElementById("resetEmail").value = email;

        showMessage(
            "forgotPasswordMessage",
            result.message || "If the account exists, a reset code will be sent.",
            "success"
        );

        setTimeout(() => {
            closeModal("forgotPasswordModal");
            openModal("resetPasswordModal");
        }, 1000);

    } catch (error) {
        showMessage("forgotPasswordMessage", error.message, "error");
    }
});

// Reset password using code
document.getElementById("resetPasswordForm").addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("resetEmail").value
        .trim()
        .toLowerCase();

    const code = document.getElementById("resetCode").value.trim();

    const newPassword = document.getElementById("newPassword").value;

    try {
        showMessage("resetPasswordMessage", "Resetting your password...");

        const result = await apiRequest("/api/reset-password", {
            method: "POST",
            body: JSON.stringify({
                email,
                code,
                newPassword
            })
        });

        showMessage(
            "resetPasswordMessage",
            result.message || "Your password has been changed successfully.",
            "success"
        );

        setTimeout(() => {
            closeModal("resetPasswordModal");
            document.getElementById("loginEmail").value = email;
            openModal("loginModal");
            showMessage(
                "loginMessage",
                "Your password has been reset. Please log in.",
                "success"
            );

            document.getElementById("resetPasswordForm").reset();
        }, 1200);

    } catch (error) {
        showMessage("resetPasswordMessage", error.message, "error");
    }
});

// ===============================
// LOGOUT
// ===============================

document.getElementById("logoutLink").addEventListener("click", () => {
    localStorage.removeItem("houseHuntingToken");
    localStorage.removeItem("houseHuntingUser");

    updateNavigation();
    closeAllModals();
    loadHouses();

    alert("You have logged out successfully.");
});

// Open login and register forms
document.getElementById("loginLink").addEventListener("click", () => {
    openModal("loginModal");
});

document.getElementById("registerLink").addEventListener("click", () => {
    openModal("registerModal");
});

// Close buttons
document.querySelectorAll(".close-modal").forEach(button => {
    button.addEventListener("click", () => {
        closeModal(button.dataset.close);
    });
});

// Close modal when clicking outside its content
document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
        if (event.target === modal) {
            modal.classList.remove("show");
        }
    });
});

// ===============================
// IMAGE URL HELPER
// ===============================

function imageURL(image) {
    if (!image) {
        return "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80";
    }

    if (image.startsWith("http://") || image.startsWith("https://")) {
        return image;
    }

    return API_URL + (image.startsWith("/") ? image : "/" + image);
}

// ===============================
// LOAD HOUSES
// ===============================

async function loadHouses() {
    const grid = document.getElementById("propertyGrid");

    grid.innerHTML = "<p>Loading houses...</p>";

    try {
        houses = await apiRequest("/api/houses");

        if (!Array.isArray(houses) || houses.length === 0) {
            grid.innerHTML = "<p>No houses are available yet. Please check again later.</p>";
            document.getElementById("houseMessage").textContent = "";
            initializeHomeMap();
            return;
        }

        displayHouses(houses);
        initializeHomeMap();

    } catch (error) {
        grid.innerHTML = `
            <p>Unable to load houses. Please make sure the backend server is running.</p>
        `;

        console.error("House loading error:", error);
    }
}

// Display property cards
function displayHouses(propertyList) {
    const grid = document.getElementById("propertyGrid");

    if (propertyList.length === 0) {
        grid.innerHTML = "<p>No matching houses found.</p>";
        return;
    }

    grid.innerHTML = propertyList.map(house => `
        <article class="property-card">
            <img
                src="${escapeHTML(imageURL(house.image))}"
                alt="${escapeHTML(house.name)}"
                onerror="this.src='https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80'"
            >

            <div class="property-info">
                <h3>${escapeHTML(house.name)}</h3>

                <p class="property-location">
                    ${escapeHTML(house.location)}
                </p>

                <div class="property-meta">
                    <span>${escapeHTML(house.house_type || "House")}</span>
                    <span>${escapeHTML(house.bedrooms ?? "N/A")} bedrooms</span>
                </div>

                <p class="property-price">
                    KSh ${Number(house.price).toLocaleString("en-KE")} / month
                </p>

                <button
                    class="btn btn-primary"
                    onclick="showHouseDetails(${Number(house.house_id)})"
                >
                    View Details
                </button>
            </div>
        </article>
    `).join("");
}

// ===============================
// SEARCH HOUSES
// ===============================

function searchHouses() {
    const search = document.getElementById("searchInput").value
        .trim()
        .toLowerCase();

    const type = document.getElementById("houseTypeFilter").value
        .toLowerCase();

    const filtered = houses.filter(house => {
        const matchesSearch =
            String(house.name).toLowerCase().includes(search) ||
            String(house.location).toLowerCase().includes(search);

        const matchesType = !type ||
            String(house.house_type || "").toLowerCase() === type;

        return matchesSearch && matchesType;
    });

    displayHouses(filtered);

    showMessage(
        "houseMessage",
        `${filtered.length} matching house(s) found.`
    );
}

document.getElementById("searchButton").addEventListener("click", searchHouses);
document.getElementById("searchInput").addEventListener("input", searchHouses);
document.getElementById("houseTypeFilter").addEventListener("change", searchHouses);

// ===============================
// HOME MAP
// ===============================

function initializeHomeMap() {
    if (!window.L) {
        console.error("Leaflet map library did not load.");
        return;
    }

    if (!homeMap) {
        homeMap = L.map("homeMap").setView([-0.677, 34.779], 10);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(homeMap);
    }

    homeMap.invalidateSize();

    if (homeMap.houseMarkers) {
        homeMap.houseMarkers.clearLayers();
    } else {
        homeMap.houseMarkers = L.layerGroup().addTo(homeMap);
    }

    houses.forEach(house => {
        if (house.latitude == null || house.longitude == null) return;

        const lat = Number(house.latitude);
        const lng = Number(house.longitude);

        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        L.marker([lat, lng])
            .addTo(homeMap.houseMarkers)
            .bindPopup(`
                <strong>${escapeHTML(house.name)}</strong><br>
                ${escapeHTML(house.location)}<br>
                KSh ${Number(house.price).toLocaleString("en-KE")}
                <br>
                <button onclick="showHouseDetails(${Number(house.house_id)})">
                    View Details
                </button>
            `);
    });
}

// ===============================
// PROPERTY DETAILS
// ===============================

async function showHouseDetails(houseId) {
    try {
        const house = await apiRequest(`/api/houses/${houseId}`);

        let interiorImages = house.interior_images || [];

        if (typeof interiorImages === "string") {
            try {
                interiorImages = JSON.parse(interiorImages);
            } catch {
                interiorImages = [];
            }
        }

        if (!Array.isArray(interiorImages)) {
            interiorImages = [];
        }

        const allImages = [house.image, ...interiorImages].filter(Boolean);

        const gallery = allImages.length
            ? allImages.map(image => `
                <img
                    src="${escapeHTML(imageURL(image))}"
                    alt="${escapeHTML(house.name)}"
                >
            `).join("")
            : `<img src="${escapeHTML(imageURL(null))}" alt="House image">`;

        const amenities = house.amenities
            ? escapeHTML(house.amenities)
            : "Not specified";

        const user = getUser();

        let viewingForm = "";

        if (!user) {
            viewingForm = `
                <p>Please log in to request a house viewing.</p>
                <button class="btn btn-primary" onclick="openModal('loginModal')">
                    Login
                </button>
            `;
        } else if (user.role === "tenant") {
            viewingForm = `
                <form id="viewingForm" class="main-form">
                    <h3>Request a Viewing</h3>

                    <label for="visitorName">Full name</label>
                    <input id="visitorName" required value="${escapeHTML(user.name)}">

                    <label for="visitorPhone">Phone number</label>
                    <input id="visitorPhone" type="tel" required value="${escapeHTML(user.phone || "")}">

                    <label for="visitorEmail">Email</label>
                    <input id="visitorEmail" type="email" value="${escapeHTML(user.email || "")}">

                    <label for="preferredDate">Preferred date</label>
                    <input id="preferredDate" type="date" min="${new Date().toISOString().split("T")[0]}" required>

                    <label for="preferredTime">Preferred time</label>
                    <input id="preferredTime" type="time" required>

                    <label for="viewingMessage">Message (optional)</label>
                    <textarea id="viewingMessage" placeholder="Write any additional information"></textarea>

                    <button type="submit" class="btn btn-primary">
                        Submit Viewing Request
                    </button>

                    <p id="viewingMessageStatus" class="message"></p>
                </form>
            `;
        } else {
            viewingForm = `
                <p>Viewing requests are available to tenant accounts.</p>
            `;
        }

        document.getElementById("houseDetails").innerHTML = `
            <div class="details-gallery">
                ${gallery}
            </div>

            <div class="details-info">
                <h2>${escapeHTML(house.name)}</h2>

                <p><strong>Location:</strong> ${escapeHTML(house.location)}</p>

                <p><strong>House type:</strong> ${escapeHTML(house.house_type || "Not specified")}</p>

                <p><strong>Bedrooms:</strong> ${escapeHTML(house.bedrooms ?? "Not specified")}</p>

                <p><strong>Monthly rent:</strong> KSh ${Number(house.price).toLocaleString("en-KE")}</p>

                <p><strong>Amenities:</strong> ${amenities}</p>

                <p><strong>Availability:</strong> ${escapeHTML(house.availability || "Available")}</p>

                <h3>Property Location</h3>
                <div id="detailsMap"></div>
            </div>

            ${viewingForm}
        `;

        openModal("detailsModal");

        setTimeout(() => {
            initializeDetailsMap(house);
        }, 150);

        const form = document.getElementById("viewingForm");

        if (form) {
            form.addEventListener("submit", event => {
                submitViewingRequest(event, house.house_id);
            });
        }

    } catch (error) {
        alert(error.message);
    }
}

// Details map
function initializeDetailsMap(house) {
    if (!window.L || house.latitude == null || house.longitude == null) {
        return;
    }

    const lat = Number(house.latitude);
    const lng = Number(house.longitude);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (detailsMap) {
        detailsMap.remove();
        detailsMap = null;
    }

    detailsMap = L.map("detailsMap").setView([lat, lng], 15);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(detailsMap);

    detailsMarker = L.marker([lat, lng]).addTo(detailsMap)
        .bindPopup(escapeHTML(house.name))
        .openPopup();

    setTimeout(() => detailsMap.invalidateSize(), 150);
}

// ===============================
// VIEWING REQUESTS
// ===============================

async function submitViewingRequest(event, houseId) {
    event.preventDefault();

    const requestData = {
        house_id: houseId,
        visitor_name: document.getElementById("visitorName").value.trim(),
        phone: document.getElementById("visitorPhone").value.trim(),
        email: document.getElementById("visitorEmail").value.trim(),
        preferred_date: document.getElementById("preferredDate").value,
        preferred_time: document.getElementById("preferredTime").value,
        message: document.getElementById("viewingMessage").value.trim()
    };

    try {
        showMessage("viewingMessageStatus", "Submitting your request...");

        const result = await apiRequest("/api/viewing-requests", {
            method: "POST",
            body: JSON.stringify(requestData)
        });

        showMessage(
            "viewingMessageStatus",
            result.message,
            "success"
        );

        document.getElementById("viewingForm").reset();

    } catch (error) {
        showMessage("viewingMessageStatus", error.message, "error");
    }
}

// ===============================
// LISTING MAP
// ===============================

function initializeListingMap() {
    if (!window.L) {
        console.error("Leaflet map library did not load.");
        return;
    }

    if (!listingMap) {
        listingMap = L.map("listingMap").setView([-0.677, 34.779], 10);

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "&copy; OpenStreetMap contributors"
        }).addTo(listingMap);

        listingMap.on("click", event => {
            selectedLatitude = event.latlng.lat;
            selectedLongitude = event.latlng.lng;

            document.getElementById("latitude").value = selectedLatitude;
            document.getElementById("longitude").value = selectedLongitude;

            if (listingMarker) {
                listingMarker.setLatLng(event.latlng);
            } else {
                listingMarker = L.marker(event.latlng, {
                    draggable: true
                }).addTo(listingMap);

                listingMarker.on("dragend", () => {
                    const position = listingMarker.getLatLng();

                    selectedLatitude = position.lat;
                    selectedLongitude = position.lng;

                    document.getElementById("latitude").value = position.lat;
                    document.getElementById("longitude").value = position.lng;
                });
            }
        });
    }

    setTimeout(() => listingMap.invalidateSize(), 150);
}

// Show listing map when List Property is clicked
document.getElementById("listPropertyLink").addEventListener("click", () => {
    setTimeout(initializeListingMap, 200);
});

// ===============================
// ADD PROPERTY
// ===============================

document.getElementById("propertyForm").addEventListener("submit", async event => {
    event.preventDefault();

    const user = getUser();

    if (!user || !["agent", "landlord"].includes(user.role)) {
        showMessage(
            "propertyMessage",
            "Only agents and landlords can list properties.",
            "error"
        );
        return;
    }

    if (selectedLatitude === null || selectedLongitude === null) {
        showMessage(
            "propertyMessage",
            "Please select the house location on the map.",
            "error"
        );
        return;
    }

    const exteriorFile = document.getElementById("exteriorImage").files[0];
    const interiorFiles = document.getElementById("interiorImages").files;

    if (!exteriorFile) {
        showMessage("propertyMessage", "Please upload a house picture.", "error");
        return;
    }

    if (interiorFiles.length > 6) {
        showMessage("propertyMessage", "You can upload a maximum of 6 interior pictures.", "error");
        return;
    }

    const formData = new FormData();

    formData.append("name", document.getElementById("propertyName").value.trim());
    formData.append("location", document.getElementById("propertyLocation").value.trim());
    formData.append("house_type", document.getElementById("houseType").value);
    formData.append("bedrooms", document.getElementById("bedrooms").value);
    formData.append("price", document.getElementById("price").value);
    formData.append("amenities", document.getElementById("amenities").value);
    formData.append("availability", document.getElementById("availability").value);
    formData.append("latitude", selectedLatitude);
    formData.append("longitude", selectedLongitude);
    formData.append("image", exteriorFile);

    for (const file of interiorFiles) {
        formData.append("interiorImages", file);
    }

    try {
        showMessage("propertyMessage", "Uploading your property...");

        const result = await apiRequest("/api/houses", {
            method: "POST",
            body: formData
        });

        showMessage("propertyMessage", result.message, "success");

        document.getElementById("propertyForm").reset();

        selectedLatitude = null;
        selectedLongitude = null;
        listingMarker = null;

        if (listingMap) {
            listingMap.eachLayer(layer => {
                if (layer instanceof L.Marker) {
                    listingMap.removeLayer(layer);
                }
            });
        }

        loadHouses();

        document.getElementById("properties").scrollIntoView({
            behavior: "smooth"
        });

    } catch (error) {
        showMessage("propertyMessage", error.message, "error");
    }
});

// ===============================
// INITIAL WEBSITE SETUP
// ===============================

document.addEventListener("DOMContentLoaded", () => {
    updateNavigation();
    loadHouses();
});
