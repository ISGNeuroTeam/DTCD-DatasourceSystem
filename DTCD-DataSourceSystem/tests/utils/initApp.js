import { ExtensionPlugin } from './../../../DTCD-SDK';

export class TestDataSource extends ExtensionPlugin {
  static getExtensionInfo() {
    return {
      type: 'Range',
    };
  }

  constructor(from, to, operation = '-1') {
    super();
    this.from = from;
    this.to = to;
    this.operation = operation;
    this.type = 'Range';
  }

  async init() {
    return true;
  }

  [Symbol.iterator]() {
    return {
      operation: this.operation,
      current: this.from,
      last: this.to,
      next() {
        if (this.current <= this.last) {
          this.current++;
          return { done: false, value: { number: eval(`${this.current}${this.operation}`) } };
        } else {
          return { done: true };
        }
      },
    };
  }
}

const systems = {
  LogSystem: {
    debug() {},
    info() {},
    warn() {},
    error() {},
    fatal() {},
  },
  EventSystem: {
    registerEvent() {},
    registerPluginInstance() {},
    subscribe() {},
  },
  StorageSystem: {
    session: {
      storage: {},
      getRecord(key) {
        return this.storage[key];
      },
      hasRecord(key) {
        return Object.keys(this.storage).includes(key);
      },
      putRecord(key, value) {
        if (!Object.keys(this.storage).includes(key))
          throw new Error(`Record with key "${key}" isn't into storage`);
        this.storage[key] = value;
      },
      addRecord(key, value) {
        if (Object.keys(this.storage).includes(key))
          throw new Error(`Record with key "${key}" exists into storage`);
        this.storage[key] = value;
      },
    },
  },
};

export const initApp = () => {
  global.Application = {
    getSystem: name => systems[name],
    getExtensions: () => [{ plugin: TestDataSource }],
    getGUID: instance => {
      return 'guid2';
    },
  };
};
