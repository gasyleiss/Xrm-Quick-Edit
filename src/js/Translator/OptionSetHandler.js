/* @preserve
 * MIT License
 *
 * Copyright (c) 2017 Florian Krönert
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 *
*/
(function (OptionSetHandler, undefined) {
    "use strict";
    var idSeparator = "|";

    function GetRecordId (id) {
        var separatorIndex = id.indexOf(idSeparator);

        if (separatorIndex === -1) {
            return id;
        }

        return id.substring(0, separatorIndex);
    }

    function GetOptionValueUpdate (attribute, value, labels) {
        if (!attribute.GlobalOptionSet && !attribute.OptionSet) {
            throw new Error("Either the global option set or the OptionSet have to be passed!");
        }

        var update = {
            Value: value,
            Label: {
                LocalizedLabels: labels
            },
            MergeLabels: true
        };

        if (attribute.GlobalOptionSet) {
            update.OptionSetName = attribute.GlobalOptionSet.Name;
        }
        else{
            var optionSet = attribute.OptionSet;

            update.EntityLogicalName = XrmTranslator.GetEntity().toLowerCase();
            update.AttributeLogicalName = attribute.LogicalName;
        }

        return update;
    }

    function GetUpdates(records) {
        var updates = [];

        for (var i = 0; i < records.length; i++) {
            var record = records[i];

            if (record.w2ui && record.w2ui.changes) {
                var recordId = GetRecordId(record.recid);
                var attribute = XrmTranslator.GetAttributeById (recordId);
                var optionSetValue = parseInt(record.schemaName);
                var changes = record.w2ui.changes;

                if (!optionSetValue) {
                    continue;
                }

                var labels = [];

                for (var change in changes) {
                    if (!changes.hasOwnProperty(change)) {
                        continue;
                    }
                    var label = { LanguageCode: change, Label: changes[change] };
                    labels.push(label);
                }

                if (labels.length < 1) {
                    continue;
                }

                var update = GetOptionValueUpdate(attribute, optionSetValue, labels);
                updates.push(update);
            }
        }

        return updates;
    }

    function FillTable () {
        var grid = XrmTranslator.GetGrid();
        grid.clear();

        var records = [];

        for (var i = 0; i < XrmTranslator.metadata.length; i++) {
            var attribute = XrmTranslator.metadata[i];

            var optionSet = attribute.OptionSet;

            if (!optionSet) {
                optionSet = attribute.GlobalOptionSet;
            }

            var options = optionSet.Options;

            if (!options || options.length === 0) {
                continue;
            }

            var record = {
                recid: attribute.MetadataId,
                schemaName: attribute.LogicalName,
                w2ui: {
                    children: []
                }
            };

            for (var j = 0; j < options.length; j++) {
                var option = options[j];
                var labels = option.Label.LocalizedLabels;

                var child = {
                    recid: record.recid + idSeparator + option.Value,
                    schemaName: option.Value
                };

                for (var k = 0; k < labels.length; k++) {
                    var label = labels[k];
                    child[label.LanguageCode.toString()] = label.Label;
                }

                record.w2ui.children.push(child);
            }

            records.push(record);
        }

        grid.add(records);
        grid.unlock();
    }

    OptionSetHandler.Load = function () {
        var entityName = XrmTranslator.GetEntity();
        var entityMetadataId = XrmTranslator.entityMetadata[entityName];

        var request = {
            entityName: "EntityDefinition",
            entityId: entityMetadataId,
            queryParams: "/Attributes/Microsoft.Dynamics.CRM.PicklistAttributeMetadata?$expand=OptionSet,GlobalOptionSet"
        };

        return WebApiClient.Retrieve(request)
            .then(function(response){
                var attributes = response.value.sort(XrmTranslator.SchemaNameComparer);
                XrmTranslator.metadata = attributes;

                FillTable();
            })
            .catch(XrmTranslator.errorHandler);
    }

    OptionSetHandler.Save = function() {
        XrmTranslator.LockGrid("Saving");

        var records = XrmTranslator.GetGrid().records;
        var updates = GetUpdates(records);

        if (!updates || updates.length === 0) {
            XrmTranslator.LockGrid("Reloading");

            return OptionSetHandler.Load();
        }

        return Promise.resolve(updates)
            .each(function(payload) {
                return WebApiClient.SendRequest("POST", WebApiClient.GetApiUrl() + "UpdateOptionValue", payload);
            })
            .then(function (response){
                XrmTranslator.LockGrid("Publishing");

                return XrmTranslator.Publish();
            })
            .then(function (response) {
                XrmTranslator.LockGrid("Reloading");

                return OptionSetHandler.Load();
            })
            .catch(XrmTranslator.errorHandler);
    }
} (window.OptionSetHandler = window.OptionSetHandler || {}));
