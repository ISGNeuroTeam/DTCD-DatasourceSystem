# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [UNRELEASED]

### Added

- saving datasource schema to `<dsName>_SCHEMA` storage session module
- add support otlrw plugin

## [0.4.0]

### Fixed
- Fixed sync datasource panels "autorun\runOnTokenChange"

## [0.3.0]

### Added

- flag for datasources autorun while setting config
- flag for token change datasource rerun
- intervals for datasources
- added oneShotRun method to invoke datasource one time

### Changed

- values of autorun and runOnTokenUpdate to true by default

## [0.2.0]

### Added

- version of core systems for adapters

### Changed

- build process in order to make directory name with current version of pluing
- unified system for all types of datasources

## [0.1.0]

### Added

- field method into DataSource class
- DataSource constructor with second callback argument
- DataSource class as Iterable object
- plugin init
- plugin hooks
- inited raw event types of dataSources
- publishing event after plugin initialization
- create/edit/delete events for datasources
