#!/usr/bin/env node

/**
 * Strider Labs OpenTable MCP Server
 *
 * MCP server that gives AI agents the ability to search restaurants,
 * check availability, make reservations, and manage bookings on OpenTable.
 * https://striderlabs.ai
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  checkAuth,
  getLoginUrl,
  searchRestaurants,
  getRestaurantDetails,
  checkAvailability,
  makeReservation,
  getReservations,
  cancelReservation,
  cleanup,
} from "./browser.js";
import { hasStoredCookies, clearCookies, getCookiesPath } from "./auth.js";

// Initialize server
const server = new Server(
  {
    name: "io.github.markswendsen-code/opentable",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "opentable_status",
        description:
          "Check if the user is logged in to OpenTable. Returns login status and instructions if not authenticated. Call this before any other OpenTable operations.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "opentable_login",
        description:
          "Get the OpenTable login URL and instructions for the user to authenticate. Use this when opentable_status returns not logged in.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "opentable_logout",
        description:
          "Clear the stored OpenTable session cookies. Use this to log out or reset the authentication state.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "opentable_search",
        description:
          "Search for restaurants on OpenTable by location, cuisine, party size, date, and time.",
        inputSchema: {
          type: "object",
          properties: {
            location: {
              type: "string",
              description:
                "Location to search (city, neighborhood, or address, e.g. 'San Francisco', 'Manhattan')",
            },
            cuisine: {
              type: "string",
              description:
                "Filter by cuisine type (e.g. 'italian', 'sushi', 'american', 'french')",
            },
            partySize: {
              type: "number",
              description: "Number of guests (default: 2)",
            },
            date: {
              type: "string",
              description: "Reservation date in YYYY-MM-DD format",
            },
            time: {
              type: "string",
              description: "Preferred time in HH:MM format (e.g. '19:00')",
            },
          },
          required: ["location"],
        },
      },
      {
        name: "opentable_get_restaurant",
        description:
          "Get detailed information about a specific restaurant including description, address, hours, and features.",
        inputSchema: {
          type: "object",
          properties: {
            restaurantId: {
              type: "string",
              description:
                "The restaurant ID or profile URL (from search results)",
            },
          },
          required: ["restaurantId"],
        },
      },
      {
        name: "opentable_check_availability",
        description:
          "Check available reservation time slots for a restaurant on a specific date and party size.",
        inputSchema: {
          type: "object",
          properties: {
            restaurantId: {
              type: "string",
              description: "The restaurant ID or profile URL",
            },
            date: {
              type: "string",
              description: "Date to check in YYYY-MM-DD format",
            },
            time: {
              type: "string",
              description:
                "Preferred time in HH:MM format (e.g. '19:00'). Availability is shown for nearby times.",
            },
            partySize: {
              type: "number",
              description: "Number of guests",
            },
          },
          required: ["restaurantId", "date", "time", "partySize"],
        },
      },
      {
        name: "opentable_make_reservation",
        description:
          "Book a restaurant reservation on OpenTable. Set confirm=false to preview before booking, confirm=true to actually book. Requires the user to be logged in.",
        inputSchema: {
          type: "object",
          properties: {
            restaurantId: {
              type: "string",
              description: "The restaurant ID or profile URL",
            },
            date: {
              type: "string",
              description: "Reservation date in YYYY-MM-DD format",
            },
            time: {
              type: "string",
              description: "Reservation time in HH:MM format (e.g. '19:00')",
            },
            partySize: {
              type: "number",
              description: "Number of guests",
            },
            specialRequests: {
              type: "string",
              description:
                "Any special requests or dietary requirements (optional)",
            },
            confirm: {
              type: "boolean",
              description:
                "Set to true to actually book the reservation, false to just preview details",
            },
          },
          required: ["restaurantId", "date", "time", "partySize", "confirm"],
        },
      },
      {
        name: "opentable_get_reservations",
        description:
          "List all upcoming reservations for the logged-in user. Requires authentication.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "opentable_cancel_reservation",
        description:
          "Cancel an existing reservation. Set confirm=false to preview, confirm=true to actually cancel. This action cannot be undone.",
        inputSchema: {
          type: "object",
          properties: {
            reservationId: {
              type: "string",
              description:
                "The reservation ID to cancel (from opentable_get_reservations)",
            },
            confirm: {
              type: "boolean",
              description:
                "Set to true to actually cancel, false to preview the cancellation",
            },
          },
          required: ["reservationId", "confirm"],
        },
      },
    ],
  };
});

// Tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "opentable_status": {
        const hasCookies = hasStoredCookies();

        if (!hasCookies) {
          const loginInfo = await getLoginUrl();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  isLoggedIn: false,
                  message: "Not logged in to OpenTable.",
                  loginUrl: loginInfo.url,
                  instructions: loginInfo.instructions,
                  cookiesPath: getCookiesPath(),
                }),
              },
            ],
          };
        }

        const authState = await checkAuth();

        if (!authState.isLoggedIn) {
          const loginInfo = await getLoginUrl();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  success: true,
                  isLoggedIn: false,
                  message: "Session expired or invalid. Please log in again.",
                  loginUrl: loginInfo.url,
                  instructions: loginInfo.instructions,
                }),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                isLoggedIn: true,
                message: "Logged in to OpenTable.",
                email: authState.email,
              }),
            },
          ],
        };
      }

      case "opentable_login": {
        const loginInfo = await getLoginUrl();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                loginUrl: loginInfo.url,
                instructions: loginInfo.instructions,
                cookiesPath: getCookiesPath(),
              }),
            },
          ],
        };
      }

      case "opentable_logout": {
        clearCookies();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                message:
                  "OpenTable session cleared. You will need to log in again.",
              }),
            },
          ],
        };
      }

      case "opentable_search": {
        const { location, cuisine, partySize, date, time } = args as {
          location: string;
          cuisine?: string;
          partySize?: number;
          date?: string;
          time?: string;
        };
        const result = await searchRestaurants({
          location,
          cuisine,
          partySize,
          date,
          time,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "opentable_get_restaurant": {
        const { restaurantId } = args as { restaurantId: string };
        const result = await getRestaurantDetails(restaurantId);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "opentable_check_availability": {
        const { restaurantId, date, time, partySize } = args as {
          restaurantId: string;
          date: string;
          time: string;
          partySize: number;
        };
        const result = await checkAvailability({
          restaurantId,
          date,
          time,
          partySize,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "opentable_make_reservation": {
        const {
          restaurantId,
          date,
          time,
          partySize,
          specialRequests,
          confirm,
        } = args as {
          restaurantId: string;
          date: string;
          time: string;
          partySize: number;
          specialRequests?: string;
          confirm: boolean;
        };
        const result = await makeReservation({
          restaurantId,
          date,
          time,
          partySize,
          specialRequests,
          confirm,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "opentable_get_reservations": {
        const result = await getReservations();

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      case "opentable_cancel_reservation": {
        const { reservationId, confirm } = args as {
          reservationId: string;
          confirm: boolean;
        };
        const result = await cancelReservation({ reservationId, confirm });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result),
            },
          ],
          isError: !result.success,
        };
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: `Unknown tool: ${name}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: errorMessage,
          }),
        },
      ],
      isError: true,
    };
  }
});

// Cleanup on exit
process.on("SIGINT", async () => {
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Strider OpenTable MCP server running");
}

main().catch(console.error);
