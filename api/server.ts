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
      return `Timeout: exceeded ${timeout}ms`;
    }
    return `Error: ${error.message}`;
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
    "get_weather",
    "Get the current weather summarization and forecast by latitude and longitude",
    {
      latitude: z.number(),
      longitude: z.number(),
    },
    async ({ latitude, longitude}) => {
      const response = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,rain_sum,precipitation_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant&current=temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m,wind_direction_10m&forecast_days=1`,
      );
      const weatherData = await response.json();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(weatherData, null, 2),
          },
        ],
      };
    },
  );

  server.tool(
    "get_exchange_rate",
    "Get the exchange rate from one currency to another. Returns the rate as a number (e.g., 1 EUR = X CNY)",
    {
      from_currency: z
        .string()
        .toLowerCase()
        .describe("Base currency code (e.g., 'eur', 'usd', 'cny')"),
      to_currency: z
        .string()
        .toLowerCase()
        .describe("Target currency code (e.g., 'cny', 'usd', 'jpy')"),
    },
    async ({ from_currency, to_currency }) => {
      try {
        const response = await fetch(
          `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${from_currency}.json`,
        );
        
        if (!response.ok) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Unable to fetch exchange rate for ${from_currency}`,
              },
            ],
          };
        }

        const data = await response.json();
        const rate = data[from_currency]?.[to_currency];

        if (rate === undefined) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Exchange rate from ${from_currency} to ${to_currency} not found`,
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: String(rate),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error.message}`,
            },
          ],
        };
      }
    },
  );
});

export { handler as GET, handler as POST, handler as DELETE };

