import { Command } from 'commander';
import dotenv from 'dotenv';
dotenv.config();

type Configuration = {
  transport: 'stdio' | 'http';
  port: number;
  host: string;
  braveApiKey: string;
};

const state: Configuration & { ready: boolean } = {
  transport: 'http',
  port: 8080,
  host: process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1',
  braveApiKey: process.env.BRAVE_API_KEY ?? '',
  ready: false,
};

export function getOptions(): Configuration | false {
  const program = new Command()
    .option('--brave-api-key <string>', 'Brave API key', process.env.BRAVE_API_KEY ?? '')
    .option('--transport <stdio|http>', 'transport type', process.env.BRAVE_MCP_TRANSPORT ?? 'http')
    .option(
      '--port <number>',
      'desired port for HTTP transport',
      process.env.BRAVE_MCP_PORT ?? '8080'
    )
    .option(
      '--host <string>',
      'desired host for HTTP transport',
      process.env.BRAVE_MCP_HOST ??
        (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1')
    )
    .allowUnknownOption()
    .parse(process.argv);

  const options = program.opts();

  if (!['stdio', 'http'].includes(options.transport)) {
    console.error(
      `Invalid --transport value: '${options.transport}'. Must be one of: stdio, http.`
    );
    return false;
  }

  if (!options.braveApiKey) {
    console.error(
      'Error: --brave-api-key is required. You can get one at https://brave.com/search/api/.'
    );
    return false;
  }

  if (options.transport === 'http') {
    if (options.port < 1 || options.port > 65535) {
      console.error(
        `Invalid --port value: '${options.port}'. Must be a valid port number between 1 and 65535.`
      );
      return false;
    }

    if (!options.host) {
      console.error('Error: --host is required');
      return false;
    }
  }

  // Update state
  state.braveApiKey = options.braveApiKey;
  state.transport = options.transport;
  state.port = options.port;
  state.host = options.host;
  state.ready = true;

  return options as Configuration;
}

export default state;
