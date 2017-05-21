var MedicalRecordsFile = require(__dirname+'/MedicalRecords/MedicalRecords.js');
var MedicalRecords = {};
MedicalRecords.create = MedicalRecordsFile.create;
exports.MedicalRecords = MedicalRecords;
