import { useEffect, useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Download } from "lucide-react";
import { devLogger } from "@/lib/dev-logger";

interface LogEntry {
  timestamp: Date;
  level: "log" | "info" | "warn" | "error" | "debug";
  message: string;
  data?: any;
}

export default function DevLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLogs(devLogger.getLogs());
    const unsubscribe = devLogger.subscribe(setLogs);
    return unsubscribe;
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const filteredLogs = filter ? logs.filter((l) => l.level === filter) : logs;

  const getLevelColor = (level: string) => {
    switch (level) {
      case "error":
        return "text-red-500";
      case "warn":
        return "text-yellow-500";
      case "info":
        return "text-blue-500";
      case "debug":
        return "text-purple-500";
      default:
        return "text-green-500";
    }
  };

  const exportLogs = () => {
    const content = logs
      .map(
        (log) =>
          `[${log.timestamp.toISOString()}] ${log.level.toUpperCase()}: ${log.message}${
            log.data ? ` ${JSON.stringify(log.data)}` : ""
          }`
      )
      .join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `logs-${Date.now()}.txt`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-green-400 font-mono">DEV LOGS</h1>
        <p className="text-green-300 text-sm">Real-time application logs and events</p>
      </div>

      <Card className="border-l-4 border-l-green-500 bg-black h-[calc(100vh-200px)] flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-sm font-mono text-green-400">
              LOGS
              <span className="ml-2 text-xs text-green-300">({filteredLogs.length})</span>
            </CardTitle>
            <div className="flex gap-1 flex-wrap">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFilter(null)}
                className={`text-xs h-7 ${filter === null ? "bg-green-500/20 text-green-400" : "text-green-300"}`}
              >
                All
              </Button>
              {["log", "info", "warn", "error", "debug"].map((level) => (
                <Button
                  key={level}
                  size="sm"
                  variant="ghost"
                  onClick={() => setFilter(level)}
                  className={`text-xs h-7 ${filter === level ? "bg-green-500/20 text-green-400" : "text-green-300"}`}
                >
                  {level}
                </Button>
              ))}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-green-300 hover:text-green-400"
                onClick={exportLogs}
                data-testid="button-export-logs"
                title="Export logs"
              >
                <Download className="h-3 w-3" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-red-300 hover:text-red-400"
                onClick={() => devLogger.clearLogs()}
                data-testid="button-clear-logs"
                title="Clear logs"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto font-mono text-xs bg-black">
          <div className="space-y-0.5">
            {filteredLogs.length === 0 ? (
              <div className="text-green-300/50 py-4">No logs yet...</div>
            ) : (
              filteredLogs.map((log, idx) => (
                <div key={idx} className="flex gap-2 text-green-300 hover:bg-green-500/10 px-2 py-0.5">
                  <span className="text-green-500 flex-shrink-0 w-20">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <span className={`flex-shrink-0 w-12 ${getLevelColor(log.level)}`}>
                    {log.level.padEnd(5)}
                  </span>
                  <span className="flex-1 break-words">{log.message}</span>
                  {log.data && (
                    <span className="text-green-400 flex-shrink-0">
                      {JSON.stringify(log.data).slice(0, 50)}
                    </span>
                  )}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
