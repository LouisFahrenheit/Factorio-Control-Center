import { LogsController } from './logs.controller';
import { ApiBridgeService } from '../api-bridge.service';
import { LOG_HISTORY_DEFAULT_TAIL } from '../../ops/ops-utils';

describe('LogsController', () => {
  let controller: LogsController;
  let mockBridge: {
    submit: jest.Mock<
      Promise<Record<string, unknown>>,
      [string, Record<string, unknown>?, string?]
    >;
  };

  beforeEach(() => {
    mockBridge = {
      submit: jest
        .fn<
          Promise<Record<string, unknown>>,
          [string, Record<string, unknown>?, string?]
        >()
        .mockResolvedValue({ ok: true }),
    };
    controller = new LogsController(mockBridge as unknown as ApiBridgeService);
  });

  it('logs dispatches log_tail with parsed integer tail count and instance override', async () => {
    await controller.logs('250', 'inst-1');
    expect(mockBridge.submit).toHaveBeenCalledWith('log_tail', {
      tail: 250,
      instance_id: 'inst-1',
    });
  });

  it('logs dispatches log_tail with default 400 lines when tail is not provided', async () => {
    await controller.logs();
    expect(mockBridge.submit).toHaveBeenCalledWith('log_tail', {
      tail: 400,
      instance_id: undefined,
    });
  });

  it('logsHistory dispatches log_file_history with defaults', async () => {
    await controller.logsHistory();
    expect(mockBridge.submit).toHaveBeenCalledWith('log_file_history', {
      tail: LOG_HISTORY_DEFAULT_TAIL,
      instance_id: undefined,
      full: false,
    });
  });

  it('logsHistory dispatches log_file_history with custom parameters', async () => {
    await controller.logsHistory('150', 'inst-2', 'true');
    expect(mockBridge.submit).toHaveBeenCalledWith('log_file_history', {
      tail: 150,
      instance_id: 'inst-2',
      full: true,
    });
  });

  it('logsProgram dispatches program_log_history with kind, tail and full', async () => {
    await controller.logsProgram('web', '100', '1');
    expect(mockBridge.submit).toHaveBeenCalledWith('program_log_history', {
      kind: 'web',
      tail: 100,
      full: true,
    });
  });
});
