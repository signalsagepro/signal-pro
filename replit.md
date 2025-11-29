# SignalPro - Trading Signal Platform

## Overview

SignalPro is a professional trading signal platform that provides real-time technical analysis and alerts for Indian stocks and forex markets. The application uses EMA (Exponential Moving Average) based strategies to detect trading opportunities across multiple timeframes (5-minute and 15-minute charts). Users can manage trading strategies, monitor multiple assets, receive signals through various notification channels, and optionally integrate with broker platforms for automated trading.

The platform is built as a full-stack TypeScript application with a React frontend and Express backend, using PostgreSQL for data persistence and WebSocket for real-time signal delivery.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Technology Stack:**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server
- Wouter for client-side routing (lightweight alternative to React Router)
- TanStack Query (React Query) for server state management and data fetching
- Shadcn/ui component library built on Radix UI primitives for accessible, customizable components
- Tailwind CSS for utility-first styling with custom design system

**Design System:**
- Material Design adapted for financial data applications with emphasis on information density
- Typography: Inter for UI text, JetBrains Mono for numerical/financial data
- Custom color scheme with light/dark mode support via CSS variables
- Consistent spacing using Tailwind units (2, 4, 6, 8)
- Fixed sidebar layout (280px) with responsive main content area

**State Management:**
- React Query handles all server state, caching, and data synchronization
- Local component state with React hooks for UI interactions
- No global state management library (Redux, Zustand) - server state kept in React Query cache

### Backend Architecture

**Technology Stack:**
- Node.js with Express.js for REST API
- TypeScript for type safety across client and server
- Drizzle ORM for type-safe database queries
- WebSocket (ws library) for real-time signal broadcasting
- Neon Database (PostgreSQL) as the database provider

**API Design:**
- RESTful API endpoints for CRUD operations on assets, strategies, signals, broker configs, and notification configs
- WebSocket connection for pushing real-time signals to connected clients
- Shared TypeScript schemas between client and server using Zod for validation

**Service Layer:**
- `market-data-generator.ts`: Simulates market data and triggers strategy evaluation every 30 seconds
- `ema-calculator.ts`: Calculates Exponential Moving Averages (EMA50, EMA200) for technical analysis
- `signal-detector.ts`: Implements strategy pattern for different signal detection algorithms (15M Above 50 EMA Bullish, 5M Above 200 EMA Reversal, 5M Pullback to 200)
- `storage.ts`: Abstraction layer for database operations (currently in-memory, designed to be replaced with Drizzle ORM implementation)

**Development vs Production:**
- Development mode (`index-dev.ts`): Vite dev server with HMR for frontend
- Production mode (`index-prod.ts`): Serves pre-built static assets from dist folder
- Single entry point pattern with conditional middleware setup

### Data Storage

**Database Schema (PostgreSQL via Drizzle ORM):**

1. **Assets Table**: Trading instruments (stocks, forex pairs)
   - Fields: id, symbol, name, type, exchange, enabled, createdAt
   - Tracks which assets are being monitored

2. **Strategies Table**: Signal detection algorithms
   - Fields: id, name, description, timeframe, enabled, type, conditions (JSON), isCustom, formula, signalCount, createdAt, updatedAt
   - Supports both preset strategies and custom user-defined formulas

3. **Signals Table**: Generated trading alerts
   - Fields: id, assetId, strategyId, type, timeframe, price, ema50, ema200, conditions (JSON), dismissed, createdAt
   - Stores all detected signals with full context

4. **Broker Configs Table**: Integration settings for broker platforms
   - Fields: id, broker, enabled, credentials (JSON), createdAt, updatedAt
   - Supports multiple brokers (Zerodha, Upstox, Angel, OANDA, Interactive Brokers, FXCM)

5. **Notification Configs Table**: Alert delivery channels
   - Fields: id, channel, enabled, settings (JSON), createdAt, updatedAt
   - Supports email, SMS, Discord, Telegram, webhooks

6. **Candle Data Table**: Historical price data
   - Fields: id, assetId, timeframe, timestamp, open, high, low, close, volume
   - Stores OHLCV data for strategy backtesting and analysis

**Migration Strategy:**
- Drizzle Kit configured for schema migrations
- Schema definitions in `shared/schema.ts` using Drizzle ORM table definitions
- Zod schemas derived from Drizzle schemas for runtime validation

### Authentication & Authorization

Currently, the application does not implement authentication. The architecture is designed for single-user deployment or assumes authentication will be added later through middleware. Session management infrastructure exists via `connect-pg-simple` but is not actively used.

### Real-time Communication

**WebSocket Implementation:**
- Server maintains a Set of connected WebSocket clients
- `broadcastSignal()` function sends new signals to all connected clients
- Client auto-reconnects on connection loss
- Signal updates trigger React Query cache invalidation for UI refresh

**Signal Generation Flow:**
1. Market data generator runs on 30-second intervals
2. For each enabled asset, generates simulated price data
3. Calculates EMA50 and EMA200 using historical candle data
4. Evaluates all enabled strategies against current market data
5. Creates signal records in database when conditions are met
6. Broadcasts signals via WebSocket to all connected clients
7. Frontend receives signal, updates cache, and displays notification

## External Dependencies

### Third-Party UI Libraries
- **Radix UI**: Headless component primitives for accessibility (@radix-ui/react-*)
- **Shadcn/ui**: Pre-built component library using Radix primitives
- **Lucide React**: Icon library for consistent iconography
- **Embla Carousel**: Carousel/slider component
- **CMDK**: Command palette component
- **React Hook Form**: Form state management with Zod validation

### Database & ORM
- **Neon Database (@neondatabase/serverless)**: Serverless PostgreSQL provider
- **Drizzle ORM**: Type-safe database toolkit with schema definitions
- **Drizzle Zod**: Integration between Drizzle schemas and Zod validation

### Developer Tools
- **Vite**: Build tool with HMR and optimized production builds
- **Replit Plugins**: Development tooling for Replit environment (cartographer, dev banner, runtime error overlay)
- **ESBuild**: JavaScript bundler for production server code

### Notification System (Implemented)

**Multi-Channel Notifications:**
- **Email**: Supports multiple providers:
  - SendGrid (professional email service)
  - Resend (modern email API)
  - Gmail (personal Gmail account)
  - Outlook (Outlook account)
  - Custom SMTP (any SMTP server via env vars: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD)
- **SMS**: Twilio integration (set Twilio Account SID, Auth Token, phone numbers)
- **Discord**: Webhook-based integration (just need webhook URL)
- **Telegram**: Bot API integration (need Bot Token and Chat ID)
- **Webhook**: Custom webhook URL (supports custom headers for authentication)

**Configuration Steps:**
1. Admin users navigate to Configuration → Notifications
2. Each channel displays step-by-step setup instructions
3. Enter required credentials/URLs in configuration fields
4. Click "Test Notification" to verify setup
5. Toggle "Enable Notifications" to activate channel

**Email Setup Options:**
- For production, use SendGrid or Resend via Replit integrations
- For development/testing, use custom SMTP or Gmail/Outlook
- Set environment variables for SMTP or use integration connectors

### Pending Integrations
- **Broker APIs**: Zerodha Kite, Upstox, Angel One, OANDA, Interactive Brokers, FXCM
- **Market Data Providers**: Real-time price feeds (currently using simulated data)

### Styling & Utilities
- **Tailwind CSS**: Utility-first CSS framework
- **Class Variance Authority**: Variant-based component styling
- **clsx & tailwind-merge**: Utility for conditional class names
- **date-fns**: Date formatting and manipulation