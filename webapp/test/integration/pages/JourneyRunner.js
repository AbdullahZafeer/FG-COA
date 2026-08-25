sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"zqmfgcoa/test/integration/pages/HeaderList",
	"zqmfgcoa/test/integration/pages/HeaderObjectPage",
	"zqmfgcoa/test/integration/pages/CharObjectPage"
], function (JourneyRunner, HeaderList, HeaderObjectPage, CharObjectPage) {
    'use strict';

    var runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('zqmfgcoa') + '/test/flp.html#app-preview',
        pages: {
			onTheHeaderList: HeaderList,
			onTheHeaderObjectPage: HeaderObjectPage,
			onTheCharObjectPage: CharObjectPage
        },
        async: true
    });

    return runner;
});

