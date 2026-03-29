/**
 * OpenTable Authentication & Session Management
 *
 * Handles cookie persistence and login state detection.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { homedir } from "os";
import { join } from "path";
// Cookie storage location: ~/.strider/opentable/
const CONFIG_DIR = join(homedir(), ".strider", "opentable");
const COOKIES_FILE = join(CONFIG_DIR, "cookies.json");
/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
    if (!existsSync(CONFIG_DIR)) {
        mkdirSync(CONFIG_DIR, { recursive: true });
    }
}
/**
 * Save cookies from browser context to disk
 */
export async function saveCookies(context) {
    ensureConfigDir();
    const cookies = await context.cookies();
    writeFileSync(COOKIES_FILE, JSON.stringify(cookies, null, 2));
}
/**
 * Load cookies from disk and add to browser context
 */
export async function loadCookies(context) {
    if (!existsSync(COOKIES_FILE)) {
        return false;
    }
    try {
        const cookiesData = readFileSync(COOKIES_FILE, "utf-8");
        const cookies = JSON.parse(cookiesData);
        if (cookies.length > 0) {
            await context.addCookies(cookies);
            return true;
        }
    }
    catch (error) {
        console.error("Failed to load cookies:", error);
    }
    return false;
}
/**
 * Clear stored cookies
 */
export function clearCookies() {
    if (existsSync(COOKIES_FILE)) {
        writeFileSync(COOKIES_FILE, "[]");
    }
}
/**
 * Check if we have stored cookies
 */
export function hasStoredCookies() {
    if (!existsSync(COOKIES_FILE)) {
        return false;
    }
    try {
        const cookiesData = readFileSync(COOKIES_FILE, "utf-8");
        const cookies = JSON.parse(cookiesData);
        return Array.isArray(cookies) && cookies.length > 0;
    }
    catch {
        return false;
    }
}
/**
 * Extract auth state from OpenTable page cookies
 */
export async function getAuthState(context) {
    const cookies = await context.cookies("https://www.opentable.com");
    // OpenTable uses various session/auth cookies
    const sessionCookie = cookies.find((c) => c.name === "OT_SESSION" ||
        c.name === "ot_session" ||
        c.name === "otd" ||
        c.name === "OTUserInfo" ||
        c.name === "ot_userid");
    if (sessionCookie) {
        return {
            isLoggedIn: true,
        };
    }
    return {
        isLoggedIn: false,
    };
}
/**
 * Get the path where cookies are stored
 */
export function getCookiesPath() {
    return COOKIES_FILE;
}
