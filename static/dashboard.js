function redirectBrowser(location) {
    // Only allow relative paths that start with a single slash ("/")
    if (
        typeof location === "string" &&
        /^\/(?!\/)/.test(location) // Matches a single-slash-prefixed path only (e.g., "/home", not "//evil.com")
    ) {
        window.location.replace(location);
    } else {
        console.warn("Blocked invalid or unsafe redirect:", location);
    }
}

async function getUserInfo() { 
    let response = await fetch("/identity", {
        method: "POST"
    });
    if (response.redirected) {
        redirectBrowser(response.url);
    }
    if (response.status !== 200) {
        // Show message as a Bootstrap alert, redirect in __ seconds. 
        redirectBrowser("/");
    }
    return await response.json();
};

async function getRoles() { 
    let response = await fetch("/roles", {
        method: "POST"
    })

    if (response.status === 401) {
        // Show message as a Bootstrap alert, redirect in __ seconds.
        redirectBrowser("/login");
    }
    return await response.json();
};

// getUserRoles(userID: string): string[]
async function getUserRoles(userID) { 
    let response = await fetch(`/userroles/${userID}`);  // todo check for identity
    return (await response.json())["roles"];
};

async function getUserAvatar(userID, avatarID) { 
    let path = `avatars/${userID}/${avatarID}.png`;
    let image = await fetch(`/images/${path}`);
    return await image.text();
};

function decimalToRGB(number) {
    if (typeof number !== "number") {
        // fallback color if input is invalid or missing
        return [80, 80, 80];
    }

    const r = (number & 0xff0000) >> 16;
    const g = (number & 0x00ff00) >> 8;
    const b = (number & 0x0000ff);

    // Avoid completely black color by using fallback gray
    if (r === 0 && g === 0 && b === 0) {
        return [80, 80, 80];
    }

    // Subtract 10 to darken color safely (ensure no negative values)
    return [Math.max(r - 10, 0), Math.max(g - 10, 0), Math.max(b - 10, 0)];
}; 

/**
 *
 * @param role
 * @param endChar
 * @param restricted
 * @param current
 * @return {string}
 */
function generateRoleTemplate(role, endChar = "", restricted = false, current = false) {
    const colorArray = decimalToRGB(role.color);

    // Defensive fallback if decimalToRGB fails (shouldn't happen after fix)
    const safeColorArray = Array.isArray(colorArray) && colorArray.length === 3
        ? colorArray
        : [80, 80, 80];

    const color = `rgb(${safeColorArray[0]}, ${safeColorArray[1]}, ${safeColorArray[2]})`;

    return `
        <div
            class="role ${restricted ? "restricted" : ""} ${current ? "current" : "assignable"}"
            style="border-color: ${color}; background-color: ${color}; cursor:pointer;"
            id="${role.id}"
        >
            ${role.name} <strong>${endChar}</strong>
        </div>
    `;
}; 
 
function generateAndRenderAssignableRoles(assignableRoles) {
    const categoryArray = ["member", "concentration", "rlc", "location", "identity", "tags"];

    let categoryCollection = "";
    categoryArray.forEach((category) => {
        // Uppercase the first character, add a space for every underscore
        const normalizedHeader = category.charAt(0).toUpperCase() + category.replace("_", " ").slice(1);

        let roleCollection = "";
        assignableRoles
            .filter(role => role.category === category && role && typeof role.color === "number")
            .map(role => {
                roleCollection += generateRoleTemplate(role, "+");
        });
 
        const categoryTemplate = `
            <details open>
                <summary id="${category}-roles-header">
                    ${normalizedHeader} Roles
                </summary>
                <div id="${category}-roles-container" style="margin-top: 1em">
                    ${roleCollection}
                </div>
            </details>
            `;
        categoryCollection += categoryTemplate;
    });

    document.getElementById("assignable-roles-accordion").innerHTML = categoryCollection;
};

/**
 * Searches for a Role in an array of Role objects by ID
 * @param roles: Role[]
 * @param roleID: string
 * @return Role
 */
function lookupRole(roles, roleID) {
    return roles.find((role) => role.id === roleID);
};

let globalRoleMap = {
    currentRoles: [],
    allRoles: [],
    rolesToAdd: [],
    rolesToRemove: []
};

// renderCurrentRoles(currentRoles: Role[])
function renderCurrentRoles(currentRoles) {
    let roleCollection = "";

    currentRoles.map((role) => {
        if (globalRoleMap.allRoles.find((anyRole) => anyRole.category === "restricted" && anyRole.id === role.id)) {
            roleCollection += generateRoleTemplate(role, "", true, true);
        } else {
            roleCollection += generateRoleTemplate(role, "x", false, true);
        };
    });

    document.getElementById("current-roles-container").innerHTML = roleCollection;
};

// generateCurrentRoles(userRoles: string[])     // this is only used when roles are given as strings
function generateCurrentRoles(userRoles) {
    // Filter out invalid roles early
    let matchingRoles = userRoles
        .map((roleID) => lookupRole(globalRoleMap.allRoles, roleID))
        .filter(role => role && typeof role.color === "number");

    let orderedRoles = matchingRoles.sort((a, b) => b.priority - a.priority);

    globalRoleMap.currentRoles = orderedRoles;
    renderCurrentRoles(orderedRoles);
};

async function submitRoleChanges(userID, roleIDsToAdd, roleIDsToRemove) {

    $("#time").text(roleIDsToAdd.length + roleIDsToRemove.length);
    $("#submit-alert").show();

    let response = await fetch("/save", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            userID: userID,
            rolesToAdd: roleIDsToAdd,
            rolesToRemove: roleIDsToRemove
        })
    })
    if (response.redirected) {
        redirectBrowser(response.url);
    } else if (response.status !== 200) {
        console.log("There was an issue saving your role changes. Please try again.\n\n" + response.status + ": " + response.statusText);
    } else {
        location.reload();   // refreshes the webpage
    };
};

window.onload = async function() {  
    $("#submit-alert").hide();

    let userInfo = await getUserInfo();
    let userImageURL = await getUserAvatar(userInfo.id, userInfo.avatar);    

    // Populate global role map
    globalRoleMap.allRoles = (await getRoles()).sort((roleA, roleB) => roleA.name > roleB.name ? 1 : -1);
    globalRoleMap.currentRoles = await getUserRoles(userInfo.id);

    // Set identity details
    document.getElementById("username").innerText = userInfo.username + "#" + userInfo.discriminator;

    const avatarIcon = document.getElementById("avatar-icon");

    // List of trusted origins allowed to serve avatar images
    const TRUSTED_ORIGINS = [
        "https://login.discordscu.com",
        "https://cdn.discordapp.com"
        // Add other trusted origins here, e.g.: 
    ];

    // Allowed image file extensions to avoid risky SVG or script injection vectors
    const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];

    /**
     * Checks if a URL is from a trusted origin.
     * @param {string} urlString
     * @returns {boolean}
     */
    function isTrustedOrigin(urlString) {
        try {
            const parsed = new URL(urlString);
            return TRUSTED_ORIGINS.includes(parsed.origin);
        } catch {
            return false;
        }
    }

    /**
     * Checks if the URL points to an allowed image extension.
     * @param {string} urlString
     * @returns {boolean}
     */
    function hasAllowedExtension(urlString) {
        try {
            const parsed = new URL(urlString);
            return ALLOWED_EXTENSIONS.some(ext => parsed.pathname.toLowerCase().endsWith(ext));
        } catch {
            return false;
        }
    }

    /**
     * Sets the avatar image if the URL is valid and safe.
     * Falls back to default image on failure.
     * @param {string} userImageURL
     */
    function setAvatarImage(userImageURL) {
        if (!userImageURL || userImageURL === "null") {
            avatarIcon.src = "./discord-small.webp"; // Safe fallback
            return;
        }

        try {
            const parsedUrl = new URL(userImageURL, window.location.origin);

            // Check protocol, origin, and extension whitelist
            if (
                (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") &&
                isTrustedOrigin(parsedUrl.href) &&
                hasAllowedExtension(parsedUrl.href)
            ) {
                avatarIcon.src = parsedUrl.href;
            } else {
                console.warn("Blocked potentially unsafe image URL:", userImageURL);
                avatarIcon.src = "./discord-small.webp";
                // Fallback to default image if URL is not safe
            }
        } catch (e) {
            console.warn("Invalid URL format:", userImageURL);
            avatarIcon.src = "./discord-small.webp";
        }
    }

    // Example usage:
    setAvatarImage(userImageURL);
 
    // Render roles
    generateCurrentRoles(globalRoleMap.currentRoles);
    generateAndRenderAssignableRoles(globalRoleMap.allRoles.filter((role) => !globalRoleMap.currentRoles.includes(role)));

    document.getElementById("submit-changes").addEventListener("click", () => {
        submitRoleChanges(userInfo.id, globalRoleMap.rolesToAdd, globalRoleMap.rolesToRemove);
    });
    
    document.getElementById("reset").addEventListener("click", () => {
        location.reload();
    });

    // click listener for each role element

    function reassignRoleEventListeners() {
        Array.from(document.getElementsByClassName("role")).forEach((role) => {
            if (!role.classList.contains("restricted")) {
                role.addEventListener("click", () => { 

                    // remove a current role
                    if (role.classList.contains("current")) {
                        // remove the Role from currentRoles
                        let currentRoleIndex = globalRoleMap.currentRoles.findIndex((r) => r.id === role.id);
                        globalRoleMap.currentRoles.splice(currentRoleIndex, 1);

                        // add to rolesToRemove
                        globalRoleMap.rolesToRemove.push(role.id);

                        // remove from rolesToAdd
                        let index = globalRoleMap.rolesToAdd.indexOf(role.id);
                        if (index !== -1) {
                            globalRoleMap.rolesToAdd.splice(index, 1);
                        };

                    } else if (role.classList.contains("assignable")) {
                        // add an assignable role
                        // add the Role to currentRoles
                        globalRoleMap.currentRoles.push(lookupRole(globalRoleMap.allRoles, role.id));

                        // add the ID to rolesToAdd
                        globalRoleMap.rolesToAdd.push(role.id) ;

                        // remove the ID from rolesToRemove
                        let index = globalRoleMap.rolesToRemove.indexOf(role.id);
                        if (index !== -1) {
                            globalRoleMap.rolesToRemove.splice(index, 1);
                        };
                    };

                    // re-render current and assignable roles
                    renderCurrentRoles(globalRoleMap.currentRoles);
                    generateAndRenderAssignableRoles(globalRoleMap.allRoles.filter((r) => !globalRoleMap.currentRoles.includes(r)));
                    reassignRoleEventListeners();
                })
            }
        })
    };

    reassignRoleEventListeners();
};