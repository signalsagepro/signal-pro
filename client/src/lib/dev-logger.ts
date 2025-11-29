type LogLevel = "log" | "info" | "warn" | "error" | "debug";

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  data?: any;
}

class DevLogger {
  private logs: LogEntry[] = [];
  private listeners: Set<(logs: LogEntry[]) => void> = new Set();
  private maxLogs = 1000;

  log(message: string, data?: any) {
    this.addLog("log", message, data);
  }

  info(message: string, data?: any) {
    this.addLog("info", message, data);
  }

  warn(message: string, data?: any) {
    this.addLog("warn", message, data);
  }

  error(message: string, data?: any) {
    this.addLog("error", message, data);
  }

  debug(message: string, data?: any) {
    this.addLog("debug", message, data);
  }

  private addLog(level: LogLevel, message: string, data?: any) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      data,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.notifyListeners();
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
    this.notifyListeners();
  }

  subscribe(listener: (logs: LogEntry[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    this.listeners.forEach((listener) => listener([...this.logs]));
  }
}

export const devLogger = new DevLogger();
