/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N/search', 'N/record', 'N/log'], function (search, record, log) {

  var SAVED_SEARCH_ID   = 'customsearch_ds_archive_product_in_shopi';
  var EVENT_LIST_FIELD  = 'custitem_ns_tx_event_list';
  var ITEM_RECORD_TYPE  = 'inventoryitem'; // change if your Shopify items are another type

  function getInputData () {
    var soSearch;
    try {
      soSearch = search.load({
        id: SAVED_SEARCH_ID
      });
    } catch (e) {
      log.error('Search load failed', 'ID: ' + SAVED_SEARCH_ID + ' | ' + e.name + ' : ' + e.message);
      return [];
    }

    var uniqueItemIds = [];
    var seen = {};

    var paged = soSearch.runPaged({
      pageSize: 1000
    });

    for (var i = 0; i < paged.pageRanges.length; i++) {
      var page = paged.fetch({ index: i });

      for (var j = 0; j < page.data.length; j++) {
        var result = page.data[j];

        var itemId = result.getValue({
          name: 'internalid',
          join: 'item',
          summary: search.Summary.GROUP
        });

        if (itemId && !seen[itemId]) {
          seen[itemId] = true;
          uniqueItemIds.push(itemId);
          log.debug('getInputData - Found item ID', itemId);
        }
      }
    }

    log.audit('getInputData', 'Unique items to process: ' + uniqueItemIds.length);
    return uniqueItemIds; // each itemId goes to map()
  }

  function map (context) {
    var itemId = context.value; // string
    log.debug('map - Start processing item', itemId);

    try {
      var itemRec = record.load({
        type: ITEM_RECORD_TYPE,
        id: itemId,
        isDynamic: false
      });

      var oldVal = itemRec.getValue({
        fieldId: EVENT_LIST_FIELD
      });

      log.debug('map - Before clear', {
        itemId: itemId,
        oldValue: oldVal
      });

      // Only do something if there is actually a value
      itemRec.setValue({
        fieldId: EVENT_LIST_FIELD,
        value: ''   // <- clears the field
      });

    itemRec.setValue({
      fieldId: 'custitem_shopify_sync_action',
      value: 3
    });

    
    itemRec.setValue({
      fieldId: 'custitem_shopify_sync_status',
      value: 1
    });      

      var savedId = itemRec.save({
        enableSourcing: false,
        ignoreMandatoryFields: true
      });

      var newVal = ''; // we just set it to ''

      log.audit('map - Cleared event list field', {
        itemId: itemId,
        recordId: savedId,
        oldValue: oldVal,
        newValue: newVal
      });

    } catch (e) {
      log.error('map - Error clearing field for item ' + itemId,
        e.name + ' : ' + e.message);
    }
  }

  function summarize (summary) {
    log.audit('Summary', 'Usage: ' + summary.usage +
      ' | Concurrency: ' + summary.concurrency +
      ' | Yields: ' + summary.yields);

    summary.mapSummary.errors.iterator().each(function (key, error) {
      log.error('Map Error for item ' + key, error);
      return true;
    });
  }

  return {
    getInputData: getInputData,
    map: map,
    summarize: summarize
  };
});
