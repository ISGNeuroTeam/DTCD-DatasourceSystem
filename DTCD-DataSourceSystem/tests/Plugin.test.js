import { DataSourceSystem } from './../src/Plugin';
import { DataSource } from './../../DTCD-DataSourceSystem/src/libs/DataSource';
import { SystemPlugin } from './../../DTCD-SDK';
import { initApp, TestDataSource } from 'utils/initApp';
import { expect } from '@jest/globals';

initApp();

test('DataSourceSystem extends SystemPlugin class', () => {
  const dsSystem = new DataSourceSystem('guid1');
  expect(dsSystem).toBeInstanceOf(SystemPlugin);
});

describe('Check DataSourceSystem static method getRegistrationMeta():', () => {
  const pluginMeta = DataSourceSystem.getRegistrationMeta();

  test('Method exists', () => {
    expect(DataSourceSystem.getRegistrationMeta).toBeDefined();
    expect(typeof DataSourceSystem.getRegistrationMeta).toEqual('function');
  });

  test('Method returns a non-empty object', () => {
    expect(pluginMeta).toBeDefined();
    expect(pluginMeta).not.toBeNull();
    expect(typeof pluginMeta).toEqual('object');
    expect(Object.keys(pluginMeta).length).toBeGreaterThan(0);
  });

  describe('Check returned meta object:', () => {
    const { type, name, title, version, priority } = pluginMeta;

    test('Property "type" is exists and is equal to "core" string', () => {
      expect(type).toBeDefined();
      expect(type).toEqual('core');
    });

    test('Property "name" is exists and is a string', () => {
      expect(name).toBeDefined();
      expect(typeof name).toEqual('string');
    });

    test('Property "title" is exists and is a string', () => {
      expect(title).toBeDefined();
      expect(typeof title).toEqual('string');
    });

    test('Property "version" is exists and is a string ', () => {
      expect(version).toBeDefined();
      expect(typeof version).toEqual('string');
    });

    test('Property "priority" is exists and is a number', () => {
      expect(priority).toBeDefined();
      expect(typeof priority).toEqual('number');
    });
  });
});
describe('DataSourceSystem', () => {
  const dsSystem = new DataSourceSystem('testGUID');
  const storageSystem = Application.getSystem('StorageSystem');

  describe('createDataSource method', () => {
    it('Create dataSource instance ', async () => {
      const ds = await dsSystem.createDataSource({
        name: 'MyTestDataSourceInstance',
        type: 'Range',
      });
      expect(ds).toBeInstanceOf(DataSource);
    });

    it('Should invoke method init of DataSource extension', async () => {
      let { plugin: Extension } = dsSystem.getExtensions('DataSourceSystem')[0];
      const initFunc = jest.fn(async () => true);
      Extension.prototype.init = initFunc;
      await dsSystem.createDataSource({ name: 'MyTestDataSourceInstance', type: 'Range' });
      expect(initFunc).toHaveBeenCalled();
    });
  });

  describe('Cache received records into session storage', () => {
    beforeEach(() => {
      storageSystem.session.storage = {};
    });

    it('DataSource object should return independent iterator objects', async () => {
      const ds = await dsSystem.createDataSource({
        name: 'MyTestDataSourceInstance',
        type: 'Range',
        to: 10,
      });
      expect(ds[Symbol.iterator]().next()).toEqual(ds[Symbol.iterator]().next());
    });

    it('DataSource object should cache result into storage', async () => {
      const dataSourceName = 'MyTestDataSourceInstance';
      const ds = await dsSystem.createDataSource({
        name: dataSourceName,
        type: 'Range',
        to: 10,
      });
      const { value } = ds[Symbol.iterator]().next();
      expect(storageSystem.session.getRecord(dataSourceName)[0]).toEqual(value);
    });

    it('DataSource object should get cached data from storage', async () => {
      const dataSourceName = 'MyTestDataSourceInstance';
      const ds = await dsSystem.createDataSource({
        name: dataSourceName,
        type: 'Range',
        to: 10,
      });
      const mockValue = '!TEST_RECORD!'; // SO, IT'S NOT OBJECT
      ds[Symbol.iterator]().next();
      storageSystem.session.getRecord(dataSourceName)[0] = mockValue;
      const { value } = ds[Symbol.iterator]().next();
      expect(value).toEqual(mockValue);
    });

    it('DataSource cached all data by "Array.from"', async () => {
      const dataSourceName = 'MyTestDataSourceInstance';

      const dsConfig = { name: dataSourceName, type: 'Range', to: 5 };
      const ds = await dsSystem.createDataSource(dsConfig);
      const expectedStorageData = Array.from(ds);
      expect(storageSystem.session.getRecord(dataSourceName)).toEqual(expectedStorageData);
    });

    it('DataSource cached data received only by "getRecords" method', async () => {
      const dataSourceName = 'MyTestDataSourceInstance';

      const dsConfig = { name: dataSourceName, type: 'Range', to: 30 };
      const ds = await dsSystem.createDataSource(dsConfig);
      const expectedStorageData = ds.getRecords(5).toArray();
      expect(storageSystem.session.getRecord(dataSourceName)).toEqual(expectedStorageData);
    });

    it('DataSource cached data on demand by "getRecords" method', async () => {
      const dataSourceName = 'MyTestDataSourceInstance';

      const dsConfig = { name: dataSourceName, type: 'Range', to: 30 };
      const ds = await dsSystem.createDataSource(dsConfig);
      ds.getRecords(5);
      const expectedStorageData = ds.getRecords(10).toArray();
      expect(storageSystem.session.getRecord(dataSourceName)).toEqual(expectedStorageData);
    });

    it('DataSource "getRecords" after "filter" method returns number filtered records from "getRecords" argument', async () => {
      const dataSourceName = 'MyTestDataSourceInstance';

      const dsConfig = { name: dataSourceName, type: 'Range', to: 30 };
      const ds = await dsSystem.createDataSource(dsConfig);
      const expectedData = Array.from(ds)
        .filter(({ number }) => String(number).includes(1))
        .slice(0, 3);

      const receivedRecords = ds.filter({ number: 1 }).getRecords(3).toArray();
      expect(receivedRecords).toEqual(expectedData);
    });

    it('DataSource cached data on demand by "getRecords" after "filter" method', async () => {
      const dataSourceName = 'MyTestDataSourceInstance';

      const dsConfig = { name: dataSourceName, type: 'Range', to: 30 };
      const ds = await dsSystem.createDataSource(dsConfig);
      ds.filter({ number: 1 }).getRecords(3);
      const expectedStorageData = ds.getRecords(21).toArray();
      expect(storageSystem.session.getRecord(dataSourceName)).toEqual(expectedStorageData);
    });
  });
});
