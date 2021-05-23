const systems = {
  LogSystem: {
    debug() {},
    info() {},
    warn() {},
    error() {},
    fatal() {},
  },
};

export const initApp = () => {
  global.Application = {
    getSystem: name => systems[name],
    getExtensions: () => [{type: 'OTL'}],
  };
};
