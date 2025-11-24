# Trading Signal Application - Design Guidelines

## Design Approach

**Selected Approach**: Design System - Material Design adapted for financial data applications

**Justification**: Trading platforms require information-dense displays, real-time data clarity, and consistent patterns for quick decision-making. Drawing inspiration from TradingView's data hierarchy and Bloomberg Terminal's efficiency with Material Design's structured component system.

**Core Principles**:
- Information clarity over decoration
- Scannable data hierarchies
- Purposeful use of space for critical metrics
- Professional, trustworthy aesthetic
- Efficient navigation between complex features

---

## Typography System

**Font Stack**: 
- Primary: Inter (via Google Fonts) - excellent readability for data
- Monospace: JetBrains Mono - for numerical data, prices, timestamps

**Hierarchy**:
- Page Titles: text-2xl font-semibold (32px)
- Section Headers: text-lg font-semibold (20px)
- Card Titles: text-base font-medium (16px)
- Body Text: text-sm (14px)
- Data/Metrics: text-sm font-mono (14px monospace)
- Captions/Labels: text-xs (12px)
- Small Data: text-xs font-mono (12px monospace)

---

## Layout System

**Spacing Primitives**: Use Tailwind units of **2, 4, 6, and 8** consistently
- Component padding: p-4 or p-6
- Section margins: mb-6 or mb-8
- Grid gaps: gap-4 or gap-6
- Tight spacing for data rows: space-y-2

**Grid Structure**:
- Main dashboard: Sidebar (280px fixed) + Main content area (flex-1)
- Card grids: grid-cols-1 md:grid-cols-2 lg:grid-cols-3
- Strategy list: Single column with expandable rows
- Signal feed: 2-column layout (signal list + detail panel)

**Container Strategy**:
- Dashboard content: max-w-full with internal padding px-6 py-4
- Modal dialogs: max-w-2xl (for configurations)
- Wide modals: max-w-4xl (for strategy builder)
- Forms: max-w-xl centered

---

## Component Library

### Navigation
**Sidebar Navigation** (Fixed left, full height):
- Logo/App name at top with version badge
- Main sections: Dashboard, Strategies, Assets, Signals, Configuration
- Developer mode toggle appears at bottom when activated
- Active state: subtle border-left indicator
- Icons from Heroicons (outline style)

**Top Bar**:
- Breadcrumb navigation
- Real-time status indicators (API connection, market hours)
- Notification bell icon with badge
- User profile dropdown

### Data Display Components

**Signal Cards**:
- Compact card design (border, rounded corners)
- Header: Strategy name + timeframe badge + timestamp
- Body: Asset symbol (large, font-mono), EMA values in table format
- Footer: Action button + dismiss option
- Signal type indicator (visual badge system)

**Strategy Cards**:
- Title with edit/delete icons
- Enabled/disabled toggle switch
- Condition summary in readable format
- Performance metrics (signals fired, success rate)
- Expandable detail section

**Asset List**:
- Table format with sortable columns
- Columns: Symbol, Name, Type (Indian/Forex), Status, Actions
- Inline editing capability
- Batch selection for operations
- Search and filter bar above

**Charts/Visualizations**:
- Placeholder containers for chart libraries (TradingView widgets)
- Height: h-64 for compact, h-96 for detailed views
- Border and subtle shadow for definition

### Forms & Inputs

**Configuration Panels**:
- Grouped sections with clear headers
- Label above input pattern
- Helper text below inputs (text-xs)
- Inputs: border, rounded, focus:ring pattern
- Save/Cancel button pair (right-aligned)

**Strategy Builder (Developer Mode)**:
- Split view: Formula editor (left) + Preview (right)
- Code editor area with monospace font
- Available variables/functions sidebar
- Test/Validate button
- Save as template option

**Broker API Configuration**:
- Tabbed interface (Indian Market / Forex)
- API key input fields (password type)
- Connection status indicator
- Test connection button
- Save credentials securely message

**Notification Settings**:
- Toggle switches for each channel (Email, SMS, Webhook)
- Conditional fields that appear when enabled
- Test notification button per channel
- Delivery log/history table

### Interactive Elements

**Buttons**:
- Primary: px-4 py-2 rounded font-medium
- Secondary: border variant
- Icon buttons: p-2 rounded (for actions)
- Danger actions: use sparingly for delete operations

**Badges**:
- Timeframe badges: 5m, 15m (uppercase, small, rounded-full)
- Status badges: Active/Inactive, Connected/Disconnected
- Signal type badges: Color-coded per strategy

**Modals**:
- Backdrop overlay
- Centered modal with shadow
- Header with title + close button
- Body content with appropriate padding (p-6)
- Footer with action buttons

### Real-time Elements

**Signal Feed**:
- Reverse chronological list
- Auto-scroll to new signals
- Visual pulse animation on new signal arrival (subtle)
- Time ago stamps (updating)

**Status Indicators**:
- Connection dots (pulsing when active)
- Market hours indicator (text + icon)
- Last updated timestamp

---

## Page Layouts

### Dashboard (Home)
- Grid of metric cards (3-4 across): Total signals today, Active strategies, Connected assets, API status
- Recent signals list (scrollable container, h-96)
- Active strategies overview (collapsible cards)

### Strategy Management
- Header with "Add Strategy" button
- Filter/search bar
- Strategy cards in single column
- Side panel for editing (slides in from right)

### Asset Management
- Bulk action toolbar
- Data table with pagination
- Add asset modal (triggered by button)
- Import CSV option

### Signal History
- Advanced filters (date range, strategy, asset type)
- Table view with export functionality
- Detail drawer for individual signals

### Configuration
- Tabbed navigation (Brokers, Notifications, General)
- Each tab: form-based configuration
- Save indicator (auto-save with feedback)

### Developer Mode
- Unlocked by 7 consecutive clicks on logo
- Banner indicating dev mode is active
- Strategy builder with code editor
- Testing console
- Strategy template library

---

## Animations

**Minimal Use**:
- Signal arrival: Subtle fade-in (200ms)
- Modal entry: Scale from 95% to 100% (150ms)
- Loading states: Simple spinner
- NO scroll animations, parallax, or complex transitions

---

## Accessibility

- All inputs have associated labels
- Form validation with clear error messages
- Keyboard navigation for all interactive elements
- Focus indicators clearly visible (ring pattern)
- Semantic HTML structure throughout
- ARIA labels for icon-only buttons