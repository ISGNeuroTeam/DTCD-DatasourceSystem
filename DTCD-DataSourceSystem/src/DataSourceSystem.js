import {
  SystemPlugin,
  LogSystemAdapter,
  StorageSystemAdapter,
  EventSystemAdapter,
} from '../../DTCD-SDK';
// import { DataSource } from './libs/DataSource';
import pluginMeta from './Plugin.Meta';

export class DataSourceSystem extends SystemPlugin {
  #guid;
  #extensions = [];
  #sources = {};
  #tokens = {};
  #logSystem;
  #storageSystem;
  #eventSystem;

  #autorun = true;
  #runOnTokenChange = true;

  get autorun() {
    return this.#autorun;
  }

  set autorun(value) {
    this.#autorun = Boolean(value);
  }

  get runOnTokenChange() {
    return this.#runOnTokenChange;
  }

  set runOnTokenChange(value) {
    this.#runOnTokenChange = Boolean(value);
  }

  static getRegistrationMeta() {
    return pluginMeta;
  }

  constructor(guid) {
    super();
    this.#guid = guid;
    this.#logSystem = new LogSystemAdapter('0.5.0', guid, pluginMeta.name);
    this.#storageSystem = new StorageSystemAdapter('0.5.0');
    this.#eventSystem = new EventSystemAdapter('0.4.0', guid);
    this.#eventSystem.registerPluginInstance(this, []);
    this.#extensions = this.getExtensions(pluginMeta.name);

    this.#eventSystem.subscribe(
      this.#storageSystem.getGUID(),
      'TokenUpdate',
      guid,
      'processTokenUpdateEvent'
    );

    this.#eventSystem.registerEvent('DataSourceCreated');
    this.#eventSystem.registerEvent('DataSourceEdited');
    this.#eventSystem.registerEvent('DataSourceDeleted');

    this.#logSystem.debug(`DataSourceSystem instance created!`);
  }

  getPluginConfig() {
    const sources = {};
    for (let source in this.#sources) {
      const { datasourceParams, type, schedule } = this.#sources[source];
      sources[source] = { datasourceParams, type };
      if (schedule) sources[source].schedule = schedule;
    }

    return { sources, autorun: this.#autorun, runOnTokenChange: this.#runOnTokenChange };
  }

  setPluginConfig(config = {}) {
    this.resetSystem();
    if (config.hasOwnProperty('autorun')) this.#autorun = config.autorun;

    if (config.hasOwnProperty('runOnTokenChange')) this.runOnTokenChange = config.runOnTokenChange;

    if (config.hasOwnProperty('sources'))
      for (let source in config.sources) {
        const { datasourceParams, type } = config.sources[source];
        this.createDataSource(source, type, datasourceParams);
        if (config.sources[source].hasOwnProperty('schedule')) {
          const { interval, intervalUnits } = config.sources[source].schedule;
          this.setDatasourceInterval(source, interval, intervalUnits);
        }
      }
  }

  getFormSettings() {}

  setFormSettings() {}

  resetSystem() {
    for (let source in this.#sources) {
      if (this.#sources[source].hasOwnProperty('schedule')) {
        clearInterval(this.#sources[source].schedule.id);
      }
      this.#storageSystem.session.removeRecord(source);
    }
    this.#sources = {};
    this.#tokens = {};
  }

  #toCache(keyRecord, data, schema) {
    if (!this.#storageSystem.session.hasRecord(keyRecord)) {
      this.#storageSystem.session.addRecord(keyRecord, data);
      this.#storageSystem.session.addRecord(`${keyRecord}_SCHEMA`, schema);
      this.#logSystem.debug(`Added record to StorageSystem for ExternalSource`);
    } else this.#storageSystem.session.putRecord(keyRecord, data);
  }

  get dataSourceTypes() {
    return this.#extensions.map(ext => ext.plugin.getExtensionInfo().type);
  }

  createDataSource(name, type, datasourceParams) {
    this.#logSystem.debug(
      `Trying to create new '${type}' DataSource with name '${name}' and params: ${JSON.stringify(
        datasourceParams
      )}`
    );
    try {
      if (typeof name !== 'string' && typeof type !== 'string') {
        this.#logSystem.error(
          `DataSourceSystem.createDataSource invoked with not String params: name - '${name}', type - '${type}'`
        );
        throw new Error('"type" and "name" arguments type must be string');
      }

      if (this.#sources.hasOwnProperty(name)) {
        this.#logSystem.error(`Datasource with name '${name}' already exists!`);
        console.error(`Datasource with name '${name}' already exists!`);
        return;
      }

      const { plugin: DataSourcePlugin } = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type.toLowerCase() === type.toLowerCase()
      );

      if (!DataSourcePlugin) {
        this.#logSystem.error(`Couldn't find extension with type - "${type}"`);
        throw new Error(`Cannot find "${type}" DataSource`);
      }
      this.#logSystem.debug(`Found extension plugin by type`);

      let processedString = '';
      if (datasourceParams.hasOwnProperty('queryString')) {
        processedString = this.#processQuerySting(name, datasourceParams.queryString);
      }

      // DATASOURCE-PLUGIN
      const dataSource = new DataSourcePlugin({
        ...datasourceParams,
        queryString: processedString,
      });

      this.#logSystem.debug(`ExternalSource instance created`);

      this.#eventSystem.registerEvent('DataSourceStatusUpdate', {
        dataSource: name,
        status: 'new',
      });

      this.#eventSystem.registerEvent('DataSourceStatusUpdate', {
        dataSource: name,
        status: 'failed',
      });

      this.#eventSystem.registerEvent('DataSourceStatusUpdate', {
        dataSource: name,
        status: 'success',
      });

      this.#sources[name] = { source: dataSource, datasourceParams, type, status: 'new' };
      this.#eventSystem.publishEvent(`DataSourceStatusUpdate`, {
        dataSource: name,
        status: 'new',
      });

      this.#eventSystem.publishEvent(`DataSourceCreated`, {
        dataSource: name,
      });

      this.#logSystem.debug(`ExternalSource instance inited`);
      if (this.autorun) this.runDataSource(name);

      return true;
    } catch (err) {
      this.#logSystem.error(err);
      throw new Error(err);
    }
  }

  oneShotRun(type, datasourceParams) {
    try {
      if (typeof type !== 'string') {
        this.#logSystem.error(
          `DataSourceSystem.createDataSource invoked with not String params: type - '${type}'`
        );
        throw new Error('"type" arguments type must be string');
      }
      const { plugin: DataSourcePlugin } = this.#extensions.find(
        ext => ext.plugin.getExtensionInfo().type.toLowerCase() === type.toLowerCase()
      );

      if (!DataSourcePlugin) {
        this.#logSystem.error(`Couldn't find extension with type - "${type}"`);
        throw new Error(`Cannot find "${type}" DataSource`);
      }
      this.#logSystem.debug(`Found extension plugin by type`);

      // DATASOURCE-PLUGIN
      const dataSource = new DataSourcePlugin(datasourceParams);

      return dataSource.init().then(isInited => {
        if (!isInited) {
          this.#logSystem.error(`Couldn't init ExternalSource instance`);
          throw new Error("Job isn't created");
        }
        return dataSource.getData();
      });
    } catch (err) {
      this.#logSystem.error(err);
      throw new Error(err);
    }
  }

  #runDataSource(name) {
    this.#logSystem.debug(`Executing DataSource '${name}'`);
    this.#sources[name].status = 'new';
    this.#sources[name].source
      .init()
      .then(isInited => {
        if (!isInited) {
          this.#sources[name].status = 'failed';
          this.#eventSystem.publishEvent(`DataSourceStatusUpdate`, {
            dataSource: name,
            status: 'failed',
          });
          this.#logSystem.error(`Couldn't init ExternalSource instance`);
          throw new Error("Job isn't created");
        }
        return {
          data: this.#sources[name].source.getData(),
          schema: this.#sources[name].source.getSchema(),
        };
      })
      .then(async source => {
        let { data, schema } = source;

        data = await data;
        schema = await schema;

        this.#toCache(name, data, schema);

        this.#sources[name].status = 'success';

        this.#eventSystem.publishEvent(`DataSourceStatusUpdate`, {
          dataSource: name,
          status: 'success',
        });
      });
  }

  editDataSource(name, params) {
    this.#logSystem.debug(
      `Trying to edit DataSource '${name}' with new parameters: ${JSON.stringify(params)}`
    );
    this.#removeDataSourceTokens(name);
    const { queryString } = params;
    let processedString = '';
    if (queryString) {
      processedString = this.#processQuerySting(name, queryString);
    }
    this.#sources[name].datasourceParams = { ...this.#sources[name].datasourceParams, ...params };
    this.#sources[name].source.editParams({ ...params, queryString: processedString });
    this.#eventSystem.publishEvent(`DataSourceEdited`, {
      dataSource: name,
    });
    this.#runDataSource(name);
    this.#logSystem.info(`DataSource '${name}' params were edited successfully`);
  }

  runDataSource(name) {
    const { queryString } = this.#sources[name].datasourceParams;
    const processedString = this.#processQuerySting(name, queryString);
    this.#sources[name].source.editParams({ queryString: processedString });
    this.#runDataSource(name);
  }

  setDatasourceInterval(name, interval, intervalUnits) {
    if (!this.#sources.hasOwnProperty(name)) {
      this.#logSystem.error(`Datasource '${name}' doesn't exist!`);
      return false;
    }

    if (typeof interval !== 'number') {
      this.#logSystem.error(`Interval value of datasource must be number!`);
      return false;
    }

    if (!['s', 'm', 'h'].includes(intervalUnits)) {
      this.#logSystem.error(`Interval units value must be string and be one of: 's', 'm', 'h'!`);
      return false;
    }

    if (this.#sources[name].hasOwnProperty('schedule')) {
      this.#logSystem.debug(`Removing previous schedule for datasource '${name}'`);
      clearInterval(this.#sources[name].schedule.id);
    }

    const millis = this.#getMilliseconds(interval, intervalUnits);

    const intervalID = setInterval(() => {
      this.runDataSource(name);
    }, millis);

    this.#sources[name].schedule = {
      id: intervalID,
      interval,
      intervalUnits,
    };

    return true;
  }

  removeDatasourceInterval(name) {
    if (!this.#sources.hasOwnProperty(name)) {
      this.#logSystem.error(`Datasource '${name}' doesn't exist!`);
      return false;
    }

    if (this.#sources[name].hasOwnProperty('schedule')) {
      this.#logSystem.debug(`Removing previous schedule for datasource '${name}'`);
      clearInterval(this.#sources[name].schedule.id);
      delete this.#sources[name].schedule;
      return true;
    }

    this.#logSystem.warn(`Datasource '${name}' doesn't have any schedule!`);
    return false;
  }

  #getMilliseconds(interval, intervalUnits) {
    switch (intervalUnits) {
      case 's':
        break;

      case 'm':
        interval = interval * 60;
        break;

      case 'h':
        interval = interval * 3600;
        break;
    }
    return interval * 1000;
  }

  processTokenUpdateEvent(eventData) {
    if (this.#runOnTokenChange && Object.keys(this.#sources).length !== 0) {
      const { token } = eventData;
      if (Array.isArray(this.#tokens[token])) {
        this.#tokens[token].forEach(dataSourceName => {
          this.runDataSource(dataSourceName);
        });
      }
    }
  }

  #removeDataSourceTokens(dataSourceName) {
    this.#logSystem.debug(`Removing DataSource '${dataSourceName}' tokens`);
    for (let token in this.#tokens) {
      const index = this.#tokens[token].indexOf(dataSourceName);
      if (index !== -1) this.#tokens[token].splice(index, 1);
      if (this.#tokens[token].length === 0) delete this.#tokens[token];
    }
  }

  #processQuerySting(dataSourceName, queryString) {
    this.#logSystem.debug(`Processing DataSources '${dataSourceName}' queryString`);
    const regexp = /\$.*?\$/g;
    const tokensWithDollars = [...queryString.matchAll(regexp)].map(prop => prop[0]);
    const tokens = tokensWithDollars.map(prop => prop.replaceAll('$', ''));
    this.#logSystem.debug(`Found tokens in queryString: ${JSON.stringify(tokens)}`);
    if (tokens.length > 0) {
      tokens.forEach(token => {
        const tokenValue = this.#storageSystem.tokenStorage.getRecord(token);
        this.#logSystem.debug(
          `Replacing token '${token}' with value '${tokenValue}' in queryString`
        );
        if (!tokenValue) queryString = queryString.replaceAll(`$${token}$`, '');
        else queryString = queryString.replaceAll(`$${token}$`, tokenValue);

        if (Array.isArray(this.#tokens[token]) && !this.#tokens[token].includes(dataSourceName)) {
          this.#tokens[token].push(dataSourceName);
        } else {
          this.#tokens[token] = [];
          this.#tokens[token].push(dataSourceName);
        }
      });
    }
    return queryString;
  }

  getDataSource(name) {
    if (this.#sources.hasOwnProperty(name)) return this.#sources[name];
    return null;
  }

  removeDataSource(name) {
    this.#eventSystem.publishEvent(`DataSourceDeleted`, {
      dataSource: name,
    });
    this.#logSystem.info(`Removing DataSource '${name}'`);
    delete this.#sources[name];
  }

  getDataSourceList() {
    return this.#sources;
  }
}
