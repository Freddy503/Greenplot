/**
 * OpenTable Browser Automation
 *
 * Playwright-based automation for OpenTable reservation operations.
 */

import { chromium, Browser, BrowserContext, Page } from "playwright";
import { saveCookies, loadCookies, getAuthState, AuthState } from "./auth.js";

const OPENTABLE_BASE_URL = "https://www.opentable.com";
const DEFAULT_TIMEOUT = 30000;

// Singleton browser instance
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

export interface Restaurant {
  id: string;
  name: string;
  cuisine: string;
  location: string;
  neighborhood?: string;
  rating?: number;
  reviewCount?: number;
  priceRange?: string;
  imageUrl?: string;
  profileUrl?: string;
}

export interface RestaurantDetails extends Restaurant {
  description?: string;
  address?: string;
  phone?: string;
  hours?: string;
  website?: string;
  features?: string[];
}

export interface AvailabilitySlot {
  time: string;
  partySize: number;
  date: string;
  reservationToken?: string;
}

export interface Reservation {
  id: string;
  restaurantName: string;
  date: string;
  time: string;
  partySize: number;
  status: string;
  confirmationNumber?: string;
  specialRequests?: string;
}

/**
 * Initialize browser with stealth settings
 */
async function initBrowser(): Promise<void> {
  if (browser) return;

  browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
  });

  context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    extraHTTPHeaders: {
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  // Apply stealth patches
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3, 4, 5],
    });
  });

  // Load saved cookies
  await loadCookies(context);

  page = await context.newPage();

  // Block unnecessary resources for speed
  await page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,mp4,webm}", (route) =>
    route.abort()
  );
}

/**
 * Get the current page, initializing if needed
 */
async function getPage(): Promise<Page> {
  await initBrowser();
  if (!page) throw new Error("Page not initialized");
  return page;
}

/**
 * Get current context
 */
async function getContext(): Promise<BrowserContext> {
  await initBrowser();
  if (!context) throw new Error("Context not initialized");
  return context;
}

/**
 * Check if user is logged in to OpenTable
 */
export async function checkAuth(): Promise<AuthState> {
  const ctx = await getContext();
  const p = await getPage();

  await p.goto(OPENTABLE_BASE_URL, {
    waitUntil: "domcontentloaded",
    timeout: DEFAULT_TIMEOUT,
  });
  await p.waitForTimeout(2000);

  const authState = await getAuthState(ctx);
  await saveCookies(ctx);

  return authState;
}

/**
 * Return login URL and instructions for the user to authenticate
 */
export async function getLoginUrl(): Promise<{
  url: string;
  instructions: string;
}> {
  const loginUrl = `${OPENTABLE_BASE_URL}/login`;
  return {
    url: loginUrl,
    instructions:
      "Please log in to OpenTable in your browser. After logging in, run the 'opentable_status' tool to verify authentication and save your session. Your session will be stored in ~/.strider/opentable/cookies.json.",
  };
}

/**
 * Search restaurants on OpenTable
 */
export async function searchRestaurants(params: {
  location: string;
  cuisine?: string;
  partySize?: number;
  date?: string;
  time?: string;
}): Promise<{ success: boolean; restaurants?: Restaurant[]; error?: string }> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    const { location, cuisine, partySize = 2, date, time } = params;

    // Build search URL with query parameters
    const searchParams = new URLSearchParams();
    searchParams.set("term", location);
    if (cuisine) searchParams.set("cuisine", cuisine);
    searchParams.set("covers", String(partySize));
    if (date) searchParams.set("dateTime", `${date}T${time || "19:00"}:00`);

    const searchUrl = `${OPENTABLE_BASE_URL}/s?${searchParams.toString()}`;
    await p.goto(searchUrl, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });
    await p.waitForTimeout(3000);

    // Wait for restaurant results
    await p
      .locator(
        '[data-test="search-result"], [data-testid="restaurant-card"], article[data-restaurant-id]'
      )
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => {});

    const restaurants: Restaurant[] = [];

    // Extract restaurant cards
    const cards = p.locator(
      '[data-test="search-result"], [data-testid="restaurant-card"], [data-restaurant-id]'
    );
    const cardCount = await cards.count();

    for (let i = 0; i < Math.min(cardCount, 20); i++) {
      const card = cards.nth(i);

      try {
        const name =
          (await card
            .locator('h2, h3, [data-test="restaurant-name"], a[data-ot-track-component="Restaurant Name"]')
            .first()
            .textContent()
            .catch(() => "")) || "";

        const cuisineText =
          (await card
            .locator('[data-test="cuisine"], span:has-text("Cuisine")')
            .first()
            .textContent()
            .catch(() => "")) || "";

        const neighborhoodText =
          (await card
            .locator('[data-test="neighborhood"], [data-testid="neighborhood"]')
            .first()
            .textContent()
            .catch(() => "")) || "";

        const ratingText =
          (await card
            .locator('[data-test="rating"], [aria-label*="rating"]')
            .first()
            .textContent()
            .catch(() => "")) || "";

        const reviewCountText =
          (await card
            .locator('[data-test="review-count"], span:has-text("reviews")')
            .first()
            .textContent()
            .catch(() => "")) || "";

        const priceRange =
          (await card
            .locator('[data-test="price"], span:has-text("$")')
            .first()
            .textContent()
            .catch(() => "")) || "";

        // Get profile link and extract restaurant ID
        const profileLink =
          (await card
            .locator("a[href*='/restaurant/']")
            .first()
            .getAttribute("href")
            .catch(() => "")) || "";
        const ridMatch = profileLink.match(/\/restaurant\/([^/?]+)/);
        const restaurantId = ridMatch?.[1] || `restaurant-${i}`;

        const restaurantIdAttr =
          (await card.getAttribute("data-restaurant-id").catch(() => "")) || restaurantId;

        if (name.trim()) {
          restaurants.push({
            id: restaurantIdAttr || restaurantId,
            name: name.trim(),
            cuisine: cuisineText.trim(),
            location: neighborhoodText.trim() || location,
            neighborhood: neighborhoodText.trim(),
            rating: parseFloat(ratingText.replace(/[^0-9.]/g, "")) || undefined,
            reviewCount:
              parseInt(reviewCountText.replace(/[^0-9]/g, "")) || undefined,
            priceRange: priceRange.trim() || undefined,
            profileUrl: profileLink
              ? `${OPENTABLE_BASE_URL}${profileLink}`
              : undefined,
          });
        }
      } catch {
        // Skip problematic cards
      }
    }

    await saveCookies(ctx);

    return { success: true, restaurants };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to search restaurants",
    };
  }
}

/**
 * Get detailed information about a specific restaurant
 */
export async function getRestaurantDetails(
  restaurantId: string
): Promise<{ success: boolean; restaurant?: RestaurantDetails; error?: string }> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    const url = restaurantId.startsWith("http")
      ? restaurantId
      : `${OPENTABLE_BASE_URL}/restaurant/${restaurantId}`;

    await p.goto(url, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await p.waitForTimeout(3000);

    const name =
      (await p
        .locator("h1, [data-test='restaurant-name']")
        .first()
        .textContent()
        .catch(() => "")) || "";

    const description =
      (await p
        .locator('[data-test="restaurant-description"], p.description, [aria-label*="description"]')
        .first()
        .textContent()
        .catch(() => "")) || "";

    const cuisineText =
      (await p
        .locator('[data-test="cuisine-link"], a[href*="/cuisine"]')
        .first()
        .textContent()
        .catch(() => "")) || "";

    const address =
      (await p
        .locator('[data-test="address"], address, [itemprop="address"]')
        .first()
        .textContent()
        .catch(() => "")) || "";

    const phone =
      (await p
        .locator('[data-test="phone"], a[href^="tel:"], [itemprop="telephone"]')
        .first()
        .textContent()
        .catch(() => "")) || "";

    const ratingText =
      (await p
        .locator('[data-test="rating-value"], [aria-label*="stars"]')
        .first()
        .textContent()
        .catch(() => "")) || "";

    const reviewCountText =
      (await p
        .locator('[data-test="review-count"]')
        .first()
        .textContent()
        .catch(() => "")) || "";

    const priceRange =
      (await p
        .locator('[data-test="price"], [aria-label*="price"]')
        .first()
        .textContent()
        .catch(() => "")) || "";

    const neighborhood =
      (await p
        .locator('[data-test="neighborhood"], [data-testid="neighborhood"]')
        .first()
        .textContent()
        .catch(() => "")) || "";

    // Extract feature tags
    const featureElements = p.locator(
      '[data-test="feature-tag"], [data-testid="feature"], li.feature'
    );
    const featureCount = await featureElements.count();
    const features: string[] = [];
    for (let i = 0; i < Math.min(featureCount, 10); i++) {
      const feat = await featureElements
        .nth(i)
        .textContent()
        .catch(() => "");
      if (feat?.trim()) features.push(feat.trim());
    }

    await saveCookies(ctx);

    return {
      success: true,
      restaurant: {
        id: restaurantId,
        name: name.trim(),
        cuisine: cuisineText.trim(),
        location: address.trim() || neighborhood.trim(),
        neighborhood: neighborhood.trim() || undefined,
        description: description.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        rating: parseFloat(ratingText.replace(/[^0-9.]/g, "")) || undefined,
        reviewCount:
          parseInt(reviewCountText.replace(/[^0-9]/g, "")) || undefined,
        priceRange: priceRange.trim() || undefined,
        features: features.length > 0 ? features : undefined,
        profileUrl: url,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to get restaurant details",
    };
  }
}

/**
 * Check available reservation times for a restaurant
 */
export async function checkAvailability(params: {
  restaurantId: string;
  date: string;
  time: string;
  partySize: number;
}): Promise<{
  success: boolean;
  slots?: AvailabilitySlot[];
  restaurantName?: string;
  error?: string;
}> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    const { restaurantId, date, time, partySize } = params;

    // Build restaurant URL with availability params
    const url = restaurantId.startsWith("http")
      ? restaurantId
      : `${OPENTABLE_BASE_URL}/restaurant/${restaurantId}`;

    const fullUrl = `${url}?dateTime=${date}T${time}:00&covers=${partySize}`;
    await p.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await p.waitForTimeout(3000);

    const restaurantName =
      (await p
        .locator("h1, [data-test='restaurant-name']")
        .first()
        .textContent()
        .catch(() => "")) || "Unknown Restaurant";

    // Wait for availability slots to load
    await p
      .locator(
        '[data-test="availability-time"], [data-testid="time-slot"], button[data-datetime]'
      )
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => {});

    const slots: AvailabilitySlot[] = [];

    // Extract available time slots
    const timeSlots = p.locator(
      '[data-test="availability-time"], [data-testid="time-slot"], button[data-datetime], [aria-label*="Reserve"]'
    );
    const slotCount = await timeSlots.count();

    for (let i = 0; i < Math.min(slotCount, 30); i++) {
      const slot = timeSlots.nth(i);

      try {
        const timeText =
          (await slot.textContent().catch(() => "")) || "";
        const datetime =
          (await slot.getAttribute("data-datetime").catch(() => "")) || "";
        const token =
          (await slot.getAttribute("data-reservation-token").catch(() => "")) ||
          undefined;

        if (timeText.trim()) {
          slots.push({
            time: timeText.trim(),
            partySize,
            date,
            reservationToken: token,
          });
        }
      } catch {
        // Skip problematic slots
      }
    }

    await saveCookies(ctx);

    return {
      success: true,
      restaurantName: restaurantName.trim(),
      slots,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Failed to check availability",
    };
  }
}

/**
 * Make a reservation at a restaurant
 */
export async function makeReservation(params: {
  restaurantId: string;
  date: string;
  time: string;
  partySize: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  specialRequests?: string;
  confirm: boolean;
}): Promise<{
  success: boolean;
  reservation?: Partial<Reservation>;
  requiresConfirmation?: boolean;
  preview?: {
    restaurantName: string;
    date: string;
    time: string;
    partySize: number;
    specialRequests?: string;
  };
  error?: string;
}> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    const {
      restaurantId,
      date,
      time,
      partySize,
      specialRequests,
      confirm,
    } = params;

    const url = restaurantId.startsWith("http")
      ? restaurantId
      : `${OPENTABLE_BASE_URL}/restaurant/${restaurantId}`;

    const fullUrl = `${url}?dateTime=${date}T${time}:00&covers=${partySize}`;
    await p.goto(fullUrl, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await p.waitForTimeout(3000);

    const restaurantName =
      (await p
        .locator("h1, [data-test='restaurant-name']")
        .first()
        .textContent()
        .catch(() => "")) || "Unknown Restaurant";

    // If not confirmed, return a preview
    if (!confirm) {
      return {
        success: true,
        requiresConfirmation: true,
        preview: {
          restaurantName: restaurantName.trim(),
          date,
          time,
          partySize,
          specialRequests,
        },
      };
    }

    // Find and click the time slot
    const timeSlot = p
      .locator(
        `[data-test="availability-time"]:has-text("${time}"), button[data-datetime*="${time}"], [aria-label*="${time}"]`
      )
      .first();

    if (await timeSlot.isVisible({ timeout: 5000 })) {
      await timeSlot.click();
      await p.waitForTimeout(2000);
    } else {
      // Try clicking the first available slot
      const firstSlot = p
        .locator(
          '[data-test="availability-time"], [data-testid="time-slot"], button[data-datetime]'
        )
        .first();
      if (await firstSlot.isVisible({ timeout: 5000 })) {
        await firstSlot.click();
        await p.waitForTimeout(2000);
      }
    }

    // Fill in special requests if provided
    if (specialRequests) {
      const requestsField = p.locator(
        'textarea[name*="request"], textarea[placeholder*="request"], [data-test="special-requests"]'
      );
      if (await requestsField.isVisible({ timeout: 3000 })) {
        await requestsField.fill(specialRequests);
      }
    }

    // Click the reserve/complete button
    const reserveButton = p
      .locator(
        'button:has-text("Complete reservation"), button:has-text("Reserve"), button[data-test="complete-reservation"], button[type="submit"]'
      )
      .first();

    if (await reserveButton.isVisible({ timeout: 5000 })) {
      await reserveButton.click();
      await p.waitForTimeout(5000);
    }

    // Extract confirmation number from success page
    const confirmationText =
      (await p
        .locator(
          '[data-test="confirmation-number"], h2:has-text("Confirmed"), [aria-label*="confirmation"]'
        )
        .first()
        .textContent()
        .catch(() => "")) || "";

    const confirmationMatch = confirmationText.match(/[A-Z0-9]{6,}/);
    const confirmationNumber = confirmationMatch?.[0];

    // Get reservation ID from URL
    const urlMatch = p.url().match(/reservation\/([^/?]+)/);
    const reservationId = urlMatch?.[1] || `res-${Date.now()}`;

    await saveCookies(ctx);

    return {
      success: true,
      reservation: {
        id: reservationId,
        restaurantName: restaurantName.trim(),
        date,
        time,
        partySize,
        status: "confirmed",
        confirmationNumber,
        specialRequests,
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to make reservation",
    };
  }
}

/**
 * Get list of upcoming reservations
 */
export async function getReservations(): Promise<{
  success: boolean;
  reservations?: Reservation[];
  error?: string;
}> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    await p.goto(`${OPENTABLE_BASE_URL}/account/reservations`, {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });
    await p.waitForTimeout(3000);

    // Wait for reservations to load
    await p
      .locator(
        '[data-test="reservation-card"], [data-testid="reservation"], article[data-reservation-id]'
      )
      .first()
      .waitFor({ timeout: 10000 })
      .catch(() => {});

    const reservations: Reservation[] = [];

    const cards = p.locator(
      '[data-test="reservation-card"], [data-testid="reservation"], article[data-reservation-id]'
    );
    const cardCount = await cards.count();

    for (let i = 0; i < Math.min(cardCount, 20); i++) {
      const card = cards.nth(i);

      try {
        const restaurantName =
          (await card
            .locator(
              'h2, h3, [data-test="restaurant-name"], a[data-ot-track-component="Restaurant Name"]'
            )
            .first()
            .textContent()
            .catch(() => "")) || "";

        const dateText =
          (await card
            .locator('[data-test="reservation-date"], time, [datetime]')
            .first()
            .textContent()
            .catch(() => "")) || "";

        const timeText =
          (await card
            .locator('[data-test="reservation-time"], [aria-label*="time"]')
            .first()
            .textContent()
            .catch(() => "")) || "";

        const partySizeText =
          (await card
            .locator('[data-test="party-size"], [aria-label*="guest"]')
            .first()
            .textContent()
            .catch(() => "")) || "";

        const statusText =
          (await card
            .locator('[data-test="reservation-status"], [aria-label*="status"]')
            .first()
            .textContent()
            .catch(() => "upcoming")) || "upcoming";

        const confirmationText =
          (await card
            .locator(
              '[data-test="confirmation-number"], span:has-text("Confirmation")'
            )
            .first()
            .textContent()
            .catch(() => "")) || "";

        const reservationId =
          (await card
            .getAttribute("data-reservation-id")
            .catch(() => "")) || `res-${i}`;

        if (restaurantName.trim()) {
          reservations.push({
            id: reservationId,
            restaurantName: restaurantName.trim(),
            date: dateText.trim(),
            time: timeText.trim(),
            partySize: parseInt(partySizeText.replace(/[^0-9]/g, "")) || 2,
            status: statusText.trim(),
            confirmationNumber: confirmationText.trim() || undefined,
          });
        }
      } catch {
        // Skip problematic cards
      }
    }

    await saveCookies(ctx);

    return { success: true, reservations };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to get reservations",
    };
  }
}

/**
 * Cancel a reservation
 */
export async function cancelReservation(params: {
  reservationId: string;
  confirm: boolean;
}): Promise<{
  success: boolean;
  requiresConfirmation?: boolean;
  message?: string;
  error?: string;
}> {
  const p = await getPage();
  const ctx = await getContext();

  try {
    const { reservationId, confirm } = params;

    if (!confirm) {
      return {
        success: true,
        requiresConfirmation: true,
        message: `Please confirm cancellation of reservation ${reservationId}. Set confirm=true to proceed.`,
      };
    }

    // Navigate to the reservation page
    const url = `${OPENTABLE_BASE_URL}/account/reservations/${reservationId}`;
    await p.goto(url, { waitUntil: "domcontentloaded", timeout: DEFAULT_TIMEOUT });
    await p.waitForTimeout(2000);

    // Click cancel button
    const cancelButton = p
      .locator(
        'button:has-text("Cancel reservation"), button:has-text("Cancel"), [data-test="cancel-reservation"]'
      )
      .first();

    if (!(await cancelButton.isVisible({ timeout: 5000 }))) {
      return {
        success: false,
        error: "Cancel button not found. Reservation may not be cancellable.",
      };
    }

    await cancelButton.click();
    await p.waitForTimeout(2000);

    // Confirm cancellation in dialog if present
    const confirmButton = p
      .locator(
        'button:has-text("Yes, cancel"), button:has-text("Confirm cancel"), [data-test="confirm-cancel"]'
      )
      .first();

    if (await confirmButton.isVisible({ timeout: 3000 })) {
      await confirmButton.click();
      await p.waitForTimeout(3000);
    }

    await saveCookies(ctx);

    return {
      success: true,
      message: `Reservation ${reservationId} has been cancelled successfully.`,
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to cancel reservation",
    };
  }
}

/**
 * Cleanup browser resources
 */
export async function cleanup(): Promise<void> {
  if (context) {
    await saveCookies(context);
  }
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
    page = null;
  }
}
