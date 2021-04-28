module.exports = {
  verbose: true,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    '^SDK$': '<rootDir>/../DTCD-SDK',
    '^utils/(.*)$': '<rootDir>/tests/utils/$1',
  },
};
