'use strict';

const hfc = require('hfc');
const MedicalRecord = require(__dirname+'/../../../tools/utils/MedicalRecord');

let tracing = require(__dirname+'/../../../tools/traces/trace.js');
let map_ID = require(__dirname+'/../../../tools/map_ID/map_ID.js');
let initial_MedicalRecords = require(__dirname+'/../../../blockchain/assets/MedicalRecords/initial_MedicalRecords.js');
let fs = require('fs');

const TYPES = [
    'regulator_to_manufacturer',
    'manufacturer_to_private',
    'private_to_lease_company',
    'lease_company_to_private',
    'private_to_scrap_merchant'
];

let MedicalRecordData;
let v5cIDResults;

function create(req, res, next, usersToSecurityContext) {
    try {
        v5cIDResults = [];
        let chain = hfc.getChain('myChain');
        MedicalRecordData = new MedicalRecord(usersToSecurityContext);

        let cars;
        res.write(JSON.stringify({message:'Creating MedicalRecords'})+'&&');
        fs.writeFileSync(__dirname+'/../../../logs/demo_status.log', '{"logs": []}');

        tracing.create('ENTER', 'POST admin/demo', req.body);

        let scenario = req.body.scenario;

        if(scenario === 'simple' || scenario === 'full') {
            cars = initial_MedicalRecords[scenario];
        } else {
            let error = {};
            error.message = 'Scenario type not recognised';
            error.error = true;
            res.end(JSON.stringify(error));
            return;
        }

        if(cars.hasOwnProperty('cars')) {
            tracing.create('INFO', 'Demo', 'Found cars');
            cars = cars.cars;
            updateDemoStatus({message: 'Creating MedicalRecords'});
            // chain.getEventHub().connect();
            return createMedicalRecords(cars)
            .then(function() {
                return v5cIDResults.reduce(function(prev, v5cID, index) {
                    let car = cars[index];
                    let seller = map_ID.user_to_id('DVLA');
                    let buyer = map_ID.user_to_id(car.Owners[1]);
                    return prev.then(function() {
                        return transferMedicalRecord(v5cID, seller, buyer, 'authority_to_manufacturer');
                    });
                }, Promise.resolve());
            })
            .then(function() {
                updateDemoStatus({message: 'Updating MedicalRecords'});
                return v5cIDResults.reduce(function(prev, v5cID, index){
                    let car = cars[index];
                    return prev.then(function() {
                        return populateMedicalRecord(v5cID, car);
                    });
                }, Promise.resolve());
            })
            .then(function() {
                updateDemoStatus({message: 'Transfering MedicalRecords between owners'});
                return v5cIDResults.reduce(function(prev, v5cID, index) {
                    let car = cars[index];
                    return prev.then(function() {
                        return transferBetweenOwners(v5cID, car);
                    });
                }, Promise.resolve());
            })
            .then(function() {
                updateDemoStatus({message: 'Demo setup'});
                // chain.getEventHub().disconnect();
                res.end(JSON.stringify({message: 'Demo setup'}));
            })
            .catch(function(err) {
                tracing.create('ERROR   DEMO', JSON.stringify(err), '');
                updateDemoStatus({message: JSON.stringify(err), error: true});
                tracing.create('ERROR', 'POST admin/demo', err.stack);
                // chain.getEventHub().disconnect();
                res.end(JSON.stringify(err));
            });
        } else {
            let error = {};
            error.message = 'Initial MedicalRecords not found';
            error.error = true;
            updateDemoStatus({message: JSON.stringify(error), error: true});
            res.end(JSON.stringify(error));
            return;
        }
    } catch (e) {
        console.log(e);
        res.end(JSON.stringify(e));
    }
}

function transferBetweenOwners(v5cID, car, results) {
    let functionName;
    let newCar = JSON.parse(JSON.stringify(car));
    if (!results) {
        results = [];
    }
    if (newCar.Owners.length > 2) {
        let seller = map_ID.user_to_id(newCar.Owners[1]); // First after DVLA
        let buyer = map_ID.user_to_id(newCar.Owners[2]); // Second after DVLA
        functionName = TYPES[results.length + 1];
        return transferMedicalRecord(v5cID, seller, buyer, functionName)
        .then(function(result) {
            console.log('[#] Transfer MedicalRecord ' + v5cID + ' between ' + seller + ' -> ' + buyer);
            results.push(result);
            newCar.Owners.shift();
            return transferBetweenOwners(v5cID, newCar, results);
        })
        .catch((err) => {
            console.log('[X] Unable to transfer MedicalRecord', err);
        });
    } else {
        return Promise.resolve(results);
    }
}

function createMedicalRecords(cars) {
    return cars.reduce(function(prev, car, index) {
        return prev.then(function() {
            return createMedicalRecord()
            .then(function(result) {
                v5cIDResults.push(result);
            });
        });
    }, Promise.resolve());
}

function createMedicalRecord() {
    console.log('[#] Creating MedicalRecord');
    return MedicalRecordData.create('DVLA');
}

function populateMedicalRecordProperty(v5cID, ownerId, propertyName, propertyValue) {
    let normalisedPropertyName = propertyName.toLowerCase();
    return MedicalRecordData.updateAttribute(ownerId, 'update_'+normalisedPropertyName, propertyValue, v5cID);
}

function populateMedicalRecord(v5cID, car) {
    console.log('[#] Populating MedicalRecord');
    let result = Promise.resolve();
    for(let propertyName in car) {
        let normalisedPropertyName = propertyName.toLowerCase();
        let propertyValue = car[propertyName];
        if (propertyName !== 'Owners') {
            result = result.then(function() {
                return populateMedicalRecordProperty(v5cID, map_ID.user_to_id(car.Owners[1]), normalisedPropertyName, propertyValue);
            });
        }
    }
    return result;
}

function transferMedicalRecord(v5cID, seller, buyer, functionName) {
    console.log('[#] Transfering MedicalRecord to ' + buyer);
    return MedicalRecordData.transfer(seller, buyer, functionName, v5cID);
}

function updateDemoStatus(status) {
    try {
        let statusFile = fs.readFileSync(__dirname+'/../../../logs/demo_status.log');
        let demoStatus = JSON.parse(statusFile);
        demoStatus.logs.push(status);
        fs.writeFileSync(__dirname+'/../../../logs/demo_status.log', JSON.stringify(demoStatus));

        if(!status.hasOwnProperty('error')) {
            if(status.message === 'Demo setup') {
                tracing.create('EXIT', 'POST admin/demo', status);
            } else {
                tracing.create('INFO', 'POST admin/demo', status.message);
            }
        } else {
            tracing.create('ERROR', 'POST admin/demo', status);
        }
    } catch (e) {
        console.log(e);
    }
}

exports.create = create;
