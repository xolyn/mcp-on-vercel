import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import vm from "vm";

// 创建安全的沙箱执行环境
function runInSandbox(code: string, timeout: number = 5000): string {
  try {
    // 创建沙箱上下文
    const sandbox = {
      console: {
        log: (...args: any[]) => args.join(" "),
        error: (...args: any[]) => args.join(" "),
        warn: (...args: any[]) => args.join(" "),
        info: (...args: any[]) => args.join(" "),
      },
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      setTimeout: undefined, // 禁用异步操作
      setInterval: undefined,
      process: undefined, // 禁用process访问
      require: undefined, // 禁用require
      global: undefined,
      __dirname: undefined,
      __filename: undefined,
    };

    // 创建VM上下文
    const context = vm.createContext(sandbox);

    // 包装代码以捕获console.log输出
    const wrappedCode = `
      let _output = [];
      let _originalLog = console.log;
      console.log = (...args) => {
        _output.push(_originalLog(...args));
      };
      
      let _result;
      try {
        _result = (function() {
          ${code}
        })();
      } catch (e) {
        _result = "Error: " + e.message;
      }
      
      _output.length > 0 ? _output.join("\\n") : String(_result);
    `;

    // 执行代码
    const result = vm.runInContext(wrappedCode, context, {
      timeout,
      displayErrors: true,
    });

    return String(result);
  } catch (error: any) {
    if (error.message?.includes("timeout")) {
      return `⏱️ 执行超时（超过${timeout}ms）`;
    }
    return `❌ 执行错误: ${error.message}`;
  }
}

const handler = createMcpHandler((server) => {
  server.tool(
    "run_javascript",
    "Run JS safely in sandbox, supports standard JS syntax and obejcts including Math, Date, and JSON. Will output returns or outputs from console.log()",
    {
      code: z.string().describe("JS code to execute"),
      timeout: z
        .number()
        .int()
        .min(100)
        .max(10000)
        .optional()
        .default(5000)
        .describe("Timeout in milliseconds, default is 5000ms"),
    },
    async ({ code, timeout }) => {
      const result = runInSandbox(code, timeout);
      return {
        content: [
          {
            type: "text",
            text: result,
          },
        ],
      };
    },
  );

  server.tool(
    "roll_dice",
    "Rolls an N-sided die",
    { sides: z.number().int().min(2) },
    async ({ sides }) => {
      const value = 1 + Math.floor(Math.random() * sides);
      return {
        content: [{ type: "text", text: value }],
      };
    },
  );

  server.tool(
    "get_weather",
    "Get the current weather at a location",
    {
      latitude: z.number(),
      longitude: z.number(),
      city: z.string(),
    },
    async ({ latitude, longitude, city }) => {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,relativehumidity_2m&timezone=auto`,
      );
      const weatherData = await response.json();
      return {
        content: [
          {
            type: "text",
            text: `🌤️ Weather in ${city}: ${weatherData.current.temperature_2m}°C, Humidity: ${weatherData.current.relativehumidity_2m}%`,
          },
        ],
      };
    },
  );
});

export { handler as GET, handler as POST, handler as DELETE };
