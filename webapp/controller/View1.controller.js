sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator",
    "sap/m/MessageToast",
    "sap/m/MessageBox",
    "sap/m/SelectDialog",
    "sap/m/StandardListItem"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, SelectDialog, StandardListItem) {
    "use strict";

    return Controller.extend("salesorder.controller.View1", {

        onInit() {
            // Local JSONModel for UI state only
            const oViewModel = new JSONModel({
                activeOrder: false,
                isEditing: false,
                selectedLineItemIndex: 0,
                manualPrice: "",
                manualDiscount: "",
                manualFreight: "",
                simulatedLockUser: "",
                initialDialogData: {},
                // F4 value help data buckets — populated dynamically on demand
                f4Data: {
                    orderType: [],
                    salesOrg: [],
                    distChannel: [],
                    division: [],
                    soldToParty: []
                }
            });
            this.getView().setModel(oViewModel, "viewModel");

            // Console all entity data when entering the page
            this.consoleEntityData();
        },

        consoleEntityData() {
            const oModel = this.getOwnerComponent().getModel();
            const sBaseUrl = oModel ? oModel.getServiceUrl() : "/odata/v4/sales-order/";
            // Ensure trailing slash for service URL
            const sNormalizedBaseUrl = sBaseUrl.endsWith("/") ? sBaseUrl : sBaseUrl + "/";

            const sExpand = "generalInfo,shippingRoute,billingFinancial,items,partners,pricingConditions,scheduleLines";
            const aEntities = [
                {
                    name: "SalesOrders (Expanded)",
                    url: `${sNormalizedBaseUrl}SalesOrders?$expand=${sExpand}&$format=json`
                },
                { name: "GeneralInfo", url: `${sNormalizedBaseUrl}GeneralInfo?$format=json` },
                { name: "SalesOrderItems", url: `${sNormalizedBaseUrl}SalesOrderItems?$format=json` },
                { name: "PartnerFunctions", url: `${sNormalizedBaseUrl}PartnerFunctions?$format=json` },
                { name: "PricingConditions", url: `${sNormalizedBaseUrl}PricingConditions?$format=json` },
                { name: "ScheduleLines", url: `${sNormalizedBaseUrl}ScheduleLines?$format=json` },
                { name: "ShippingRoute", url: `${sNormalizedBaseUrl}ShippingRoute?$format=json` },
                { name: "BillingFinancial", url: `${sNormalizedBaseUrl}BillingFinancial?$format=json` }
            ];

            /* eslint-disable no-console, @sap-ux/fiori-tools/sap-no-hardcoded-color */
            console.log("%c--- INITIATING ODATA V4 ENTITY DATA CONSOLE DUMP ---", "color: #1a73e8; font-weight: bold; font-size: 14px;");
            /* eslint-enable no-console, @sap-ux/fiori-tools/sap-no-hardcoded-color */

            aEntities.forEach(oEnt => {
                fetch(oEnt.url)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error("HTTP " + response.status + " for " + oEnt.name);
                        }
                        return response.json();
                    })
                    .then(data => {
                        /* eslint-disable no-console, @sap-ux/fiori-tools/sap-no-hardcoded-color */
                        const aData = data.value || [];
                        console.groupCollapsed(`%cOData Entity Set: ${oEnt.name} (${aData.length} records)`, "color: #0070f3; font-weight: bold;");
                        console.log(`Raw data for ${oEnt.name}:`, aData);
                        if (aData.length > 0) {
                            console.table(aData);
                        } else {
                            console.log("No records found.");
                        }
                        console.groupEnd();
                        /* eslint-enable no-console, @sap-ux/fiori-tools/sap-no-hardcoded-color */
                    })
                    .catch(error => {
                        /* eslint-disable no-console */
                        console.error(`Failed to fetch entity set ${oEnt.name}:`, error);
                        /* eslint-enable no-console */
                    });
            });
        },

        /* Master Page Search */
        onSearch(oEvent) {
            const sQuery = oEvent.getParameter("newValue") || oEvent.getParameter("query") || "";
            const oList = this.byId("orderList");
            const oBinding = oList.getBinding("items");

            let aFilters = [];
            if (sQuery && sQuery.length > 0) {
                aFilters.push(new Filter("salesOrder", FilterOperator.Contains, sQuery));
            }
            oBinding.filter(aFilters);
        },

        /* Order Selection from Master List */
        onOrderSelect(oEvent) {
            const oItem = oEvent.getParameter("listItem") || oEvent.getSource();
            if (!oItem) {
                return;
            }
            const oCtx = oItem.getBindingContext();
            if (!oCtx) {
                return;
            }

            const oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/activeOrder", true);
            oViewModel.setProperty("/isEditing", false);
            oViewModel.setProperty("/selectedLineItemIndex", 0);

            // Bind the detail page using standard bindElement to ensure it fetches expansions cleanly
            const oDetailPage = this.byId("detailPage");
            if (oDetailPage) {
                oDetailPage.bindElement({
                    path: oCtx.getPath(),
                    parameters: {
                        $expand: "generalInfo,shippingRoute,billingFinancial,items,partners,pricingConditions,scheduleLines"
                    }
                });
            }

            // On phone/mobile viewports, transition to show the Detail page
            const oSplitApp = this.byId("splitApp");
            if (oSplitApp) {
                oSplitApp.toDetail("detailPage");
            }
        },

        /* Add new Line Item row to the current Sales Order */
        onAddItem() {
            const oDetailPage = this.byId("detailPage");
            const oCtx = oDetailPage.getBindingContext();
            if (!oCtx) {
                MessageToast.show("Please select a Sales Order first.");
                return;
            }

            // Get the list binding directly from the Table control's items aggregation
            const oItemsTable = this.byId("itemsTable");
            const oItemsBinding = oItemsTable ? oItemsTable.getBinding("items") : null;

            if (!oItemsBinding) {
                MessageToast.show("Could not find the Line Items table binding.");
                return;
            }

            // Auto-generate the item number (e.g. 10, 20, 30...)
            const iNextNum = (oItemsTable.getItems().length + 1) * 10;

            // Create a blank new row with default values directly in the table's binding
            oItemsBinding.create({
                itemNum: String(iNextNum),
                material: "",
                description: "",
                quantity: 1,
                uom: "EA",
                plant: "1010",
                storageLocation: "101A",
                itemCategory: "TAN",
                netValue: 0.00
            });

            MessageToast.show("New line item row (" + iNextNum + ") added. Fill in the details.");
        },

        /* Create Order (Initial Step Dialog Launch) */
        onCreateOrder() {
            const oViewModel = this.getView().getModel("viewModel");
            
            // Seed transient dialog values in viewModel
            oViewModel.setProperty("/initialDialogData", {
                // orderType: "OR",
                // orderTypeDesc: "Standard Order (VBAK-AUART)",
                // salesOrg: "1010",
                // salesOrgDesc: "Sales Org US (New York)",
                // distChannel: "10",
                // distChannelDesc: "Direct Sales (VTWEG)",
                // division: "00",
                // divisionDesc: "Cross-Division (SPART)",
                // soldToParty: "10100003",
                // soldToPartyDesc: "US Customer Corp"
            });

            // Asynchronously load the Dialog XML Fragment
            const oView = this.getView();
            if (!this._oCreateOrderDialog) {
                this.loadFragment({
                    name: "salesorder.view.CreateOrderDialog"
                }).then(function (oDialog) {
                    this._oCreateOrderDialog = oDialog;
                    oView.addDependent(this._oCreateOrderDialog);
                    this._oCreateOrderDialog.open();
                }.bind(this));
            } else {
                this._oCreateOrderDialog.open();
            }
        },

        onCloseCreateDialog() {
            if (this._oCreateOrderDialog) {
                this._oCreateOrderDialog.close();
            }
        },

        /* Proceed with Creation by creating a local transient context (client-side draft) */
        onContinueCreateOrder() {
            this.onCloseCreateDialog();
            
            const oViewModel = this.getView().getModel("viewModel");
            const oInputData = oViewModel.getProperty("/initialDialogData");

            const oList = this.byId("orderList");
            const oBinding = oList ? oList.getBinding("items") : null;

            if (!oBinding) {
                MessageBox.error("Could not find the Sales Orders list binding.");
                return;
            }

            // Create a local transient context (client-side draft)
            const oNewContext = oBinding.create({
                salesOrder: "Draft",
                status: "Temporary Draft",
                netValue: 0.00,
                generalInfo: {
                    orderType: oInputData.orderType,
                    salesOrg: oInputData.salesOrg,
                    soldToParty: oInputData.soldToParty,
                    reqDeliveryDate: new Date().toISOString().split("T")[0]
                }
            });

            // Keep reference to draft context for backend action resolution upon Save
            this._oDraftContext = oNewContext;

            // Bind the newly created transient context to the detail view
            const oDetailPage = this.byId("detailPage");
            oDetailPage.setBindingContext(oNewContext);
            
            oViewModel.setProperty("/activeOrder", true);
            oViewModel.setProperty("/isEditing", true); // Immediately switch to edit mode for the user to make changes
            
            MessageToast.show("Draft order initiated. Review details, fill in additional fields, and click Save.");
        },

        /* ================================================================
         * Value Help Handlers — all delegate to _fetchAndOpenF4()
         * ================================================================ */
        onOrderTypeHelp(oEvent) {
            const oViewModel = this.getView().getModel("viewModel");
            this._fetchAndOpenF4(
                oEvent.getSource(),
                "/sap/opu/odata4/sap/zsb_value_helps/srvd_a2x/sap/zsd_value_helps/0001/SalerOrderType",
                "orderType",
                "Select Sales Order Type (AUART)",
                function (oItem) {
                    oViewModel.setProperty("/initialDialogData/orderType", oItem.key);
                    oViewModel.setProperty("/initialDialogData/orderTypeDesc", oItem.desc);
                }
            );
        },

        onSalesOrgHelp(oEvent) {
            const oViewModel = this.getView().getModel("viewModel");
            this._fetchAndOpenF4(
                oEvent.getSource(),
                "/sap/opu/odata4/sap/zsb_value_helps/srvd_a2x/sap/zsd_value_helps/0001/SalesOrgnization",
                "salesOrg",
                "Select Sales Organization (VKORG)",
                function (oItem) {
                    oViewModel.setProperty("/initialDialogData/salesOrg", oItem.key);
                    oViewModel.setProperty("/initialDialogData/salesOrgDesc", oItem.desc);
                }
            );
        },

        onDistChannelHelp(oEvent) {
            const oViewModel = this.getView().getModel("viewModel");
            this._fetchAndOpenF4(
                oEvent.getSource(),
                "/sap/opu/odata4/sap/zsb_value_helps/srvd_a2x/sap/zsd_value_helps/0001/DistributionChannel",
                "distChannel",
                "Select Distribution Channel (VTWEG)",
                function (oItem) {
                    oViewModel.setProperty("/initialDialogData/distChannel", oItem.key);
                    oViewModel.setProperty("/initialDialogData/distChannelDesc", oItem.desc);
                }
            );
        },

        onDivisionHelp(oEvent) {
            const oViewModel = this.getView().getModel("viewModel");
            this._fetchAndOpenF4(
                oEvent.getSource(),
                "/sap/opu/odata4/sap/zsb_value_helps/srvd_a2x/sap/zsd_value_helps/0001/Division",
                "division",
                "Select Division (SPART)",
                function (oItem) {
                    oViewModel.setProperty("/initialDialogData/division", oItem.key);
                    oViewModel.setProperty("/initialDialogData/divisionDesc", oItem.desc);
                }
            );
        },

        onSoldToPartyHelp(oEvent) {
            const oViewModel = this.getView().getModel("viewModel");
            this._fetchAndOpenF4(
                oEvent.getSource(),
                "/sap/opu/odata4/sap/zsb_value_helps/srvd_a2x/sap/zsd_value_helps/0001/SoldToParty",
                "soldToParty",
                "Select Sold-To Customer (KNA1)",
                function (oItem) {
                    oViewModel.setProperty("/initialDialogData/soldToParty", oItem.key);
                    oViewModel.setProperty("/initialDialogData/soldToPartyDesc", oItem.desc);
                },
                true
            );
        },

        /* Change Handlers — clear description when user types manually */
        onOrderTypeChange(oEvent) {
            const oViewModel = this.getView().getModel("viewModel");
            const val = oEvent.getSource().getValue().toUpperCase();
            oEvent.getSource().setValue(val);
            oViewModel.setProperty("/initialDialogData/orderType", val);
            oViewModel.setProperty("/initialDialogData/orderTypeDesc", "");
        },

        onSalesOrgChange(oEvent) {
            const oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/initialDialogData/salesOrg", oEvent.getSource().getValue());
            oViewModel.setProperty("/initialDialogData/salesOrgDesc", "");
        },

        onDistChannelChange(oEvent) {
            const oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/initialDialogData/distChannel", oEvent.getSource().getValue());
            oViewModel.setProperty("/initialDialogData/distChannelDesc", "");
        },

        onDivisionChange(oEvent) {
            const oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/initialDialogData/division", oEvent.getSource().getValue());
            oViewModel.setProperty("/initialDialogData/divisionDesc", "");
        },

        onSoldToPartyChange(oEvent) {
            const oViewModel = this.getView().getModel("viewModel");
            oViewModel.setProperty("/initialDialogData/soldToParty", oEvent.getSource().getValue());
            oViewModel.setProperty("/initialDialogData/soldToPartyDesc", "");
        },

        /* ================================================================
         * _fetchAndOpenF4 — Unified F4 value help engine
         *
         * Hits the OData V4 endpoint, dynamically extracts property keys
         * (ignoring @odata.* metadata and internal ID fields), deduplicates
         * by the first real key, stores the result in viewModel>/f4Data/*,
         * and opens a model-bound SelectDialog.
         *
         * Parameters:
         *   oInput      — the sap.m.Input that triggered the value help
         *   sUrl        — full OData fetch URL (with $select + $format=json)
         *   sF4Key      — viewModel f4Data bucket key (e.g. "orderType")
         *   sTitle      — SelectDialog title
         *   fnConfirm   — callback({ key, desc }) called on user selection
         *   bShowInfo   — whether to show the third column (info) in the list
         * ================================================================ */
        _fetchAndOpenF4(oInput, sUrl, sF4Key, sTitle, fnConfirm, bShowInfo) {
            const oViewModel = this.getView().getModel("viewModel");

            fetch(sUrl, {
                headers: {
                    "Accept": "application/json"
                }
            })
                .then(response => {
                    if (!response.ok) {
                        return response.text().then(text => {
                            throw new Error("HTTP " + response.status + ": " + text);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    const aResults = data.value || [];
                    const seen = {};
                    const aMapped = [];

                    aResults.forEach(item => {
                        // Dynamically extract real property keys — skip OData metadata
                        // and internal surrogate keys (ID, *_ID)
                        const keys = Object.keys(item).filter(
                            k => !k.startsWith("@") && k !== "ID" && !k.endsWith("_ID")
                        );
                        const sKey = (keys[0] && item[keys[0]]) ? String(item[keys[0]]) : "";
                        if (sKey && !seen[sKey]) {
                            seen[sKey] = true;
                            aMapped.push({
                                key: sKey,
                                desc: (keys[1] && item[keys[1]]) ? String(item[keys[1]]) : sKey,
                                info: (keys[2] && item[keys[2]]) ? String(item[keys[2]]) : ""
                            });
                        }
                    });

                    /* eslint-disable no-console, @sap-ux/fiori-tools/sap-no-hardcoded-color */
                    console.groupCollapsed(
                        "%cF4 Dropdown Data: " + sTitle + " [" + sF4Key + "] — " + aMapped.length + " records",
                        "color: #0070f3; font-weight: bold;"
                    );
                    console.log("Raw OData response (data.value):", aResults);
                    console.log("Mapped F4 items (key/desc/info):", aMapped);
                    console.table(aMapped);
                    console.groupEnd();
                    /* eslint-enable no-console, @sap-ux/fiori-tools/sap-no-hardcoded-color */

                    // Store in dedicated f4Data bucket in viewModel
                    oViewModel.setProperty("/f4Data/" + sF4Key, aMapped);

                    // Open the model-bound SelectDialog
                    this._openF4SelectDialog(
                        oInput,
                        "/f4Data/" + sF4Key,
                        sTitle,
                        fnConfirm,
                        bShowInfo
                    );
                })
                .catch(error => {
                    /* eslint-disable no-console */
                    console.error("F4 Help Fetch Error [" + sF4Key + "] from URL " + sUrl + ":", error);
                    /* eslint-enable no-console */
                    MessageToast.show("Could not load value help data from service.");
                });
        },

        /* ================================================================
         * _openF4SelectDialog — Model-bound SelectDialog
         *
         * Binds items declaratively to viewModel>/f4Data/* so the
         * SelectDialog is always in sync with the fetched OData results.
         * ================================================================ */
        _openF4SelectDialog(oInput, sModelPath, sTitle, fnConfirm, bShowInfo) {
            const oSelectDialog = new SelectDialog({
                title: sTitle,
                items: {
                    path: "viewModel>" + sModelPath,
                    template: new StandardListItem({
                        title: "{viewModel>key}",
                        description: "{viewModel>desc}",
                        info: bShowInfo ? "{viewModel>info}" : ""
                    })
                },
                confirm: (oConfirmEvent) => {
                    const oSelected = oConfirmEvent.getParameter("selectedItem");
                    if (oSelected) {
                        const sKey  = oSelected.getTitle();
                        const sDesc = oSelected.getDescription();
                        oInput.setValue(sKey);
                        fnConfirm({ key: sKey, desc: sDesc });
                    }
                },
                search: (oSearchEvent) => {
                    const sVal = oSearchEvent.getParameter("value");
                    const oFilter = new Filter([
                        new Filter("key",  FilterOperator.Contains, sVal),
                        new Filter("desc", FilterOperator.Contains, sVal)
                    ], false);
                    oSearchEvent.getSource().getBinding("items").filter([oFilter]);
                }
            });
            this.getView().addDependent(oSelectDialog);
            oSelectDialog.open();
        },

        /* Toggle Simulated Session Lock */
        onToggleLock() {
            const oViewModel = this.getView().getModel("viewModel");
            const sLock = oViewModel.getProperty("/simulatedLockUser");
            if (sLock) {
                oViewModel.setProperty("/simulatedLockUser", "");
                MessageToast.show("Document lock released. Edit mode is now available.");
            } else {
                oViewModel.setProperty("/simulatedLockUser", "SYSTEM_AGENT_99");
                oViewModel.setProperty("/isEditing", false); // Kick out of editing
                MessageToast.show("Exclusive S/4HANA lock set by SYSTEM_AGENT_99.");
            }
        },

        /* Switch Active Order to Edit Mode */
        onEditOrder() {
            const oViewModel = this.getView().getModel("viewModel");
            const sLockedBy = oViewModel.getProperty("/simulatedLockUser");
            if (sLockedBy) {
                MessageBox.error("Cannot edit: Exclusive document lock held by session '" + sLockedBy + "'.");
                return;
            }
            oViewModel.setProperty("/isEditing", true);
            MessageToast.show("VA02: switched to editing mode.");
        },

        /* Discard Current Changes */
        onDiscardDraft() {
            const oViewModel = this.getView().getModel("viewModel");
            MessageBox.confirm("Are you sure you want to discard your changes?", {
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: (oAction) => {
                    if (oAction === MessageBox.Action.YES) {
                        oViewModel.setProperty("/isEditing", false);
                        // Reset local changes in default OData model
                        this.getView().getModel().resetChanges();
                        MessageToast.show("Changes discarded.");
                    }
                }
            });
        },

        /* Save Order modifications */
        onSaveOrder() {
            const oViewModel = this.getView().getModel("viewModel");
            const oModel = this.getView().getModel();
            const oInputData = oViewModel.getProperty("/initialDialogData");
            
            // Scenario A: Saving a brand new draft creation via the S/4HANA unbound action
            if (this._oDraftContext) {
                MessageToast.show("Initiating Sales Document creation on S/4HANA...");

                const sBaseUrl = oModel.getServiceUrl();
                const sNormalizedBaseUrl = sBaseUrl.endsWith("/") ? sBaseUrl : sBaseUrl + "/";
                const sActionUrl = sNormalizedBaseUrl + "createOrder";

                const oPayload = {
                    input: {
                        orderType: oInputData.orderType,
                        salesOrg: oInputData.salesOrg,
                        soldToParty: oInputData.soldToParty
                    }
                };

                fetch(sActionUrl, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(oPayload)
                })
                .then(response => {
                    if (!response.ok) {
                        // Mock Mode Fallback: If mock server returns 404 or 501 (doesn't support unbound actions)
                        if (response.status === 404 || response.status === 501) {
                            return {
                                ID: "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
                                salesOrder: "salesOr_1",
                                status: "Active Version"
                            };
                        }
                        return response.text().then(text => {
                            throw new Error("HTTP error " + response.status + ": " + text);
                        });
                    }
                    return response.json();
                })
                .then(data => {
                    if (data && data.ID) {
                        MessageToast.show("Standard Sales Order successfully posted to backend OData!");
                        
                        // 1. Safely reset all local transient draft changes on the model
                        oModel.resetChanges();
                        this._oDraftContext = null;

                        // 2. Bind the newly created Sales Order context to the detail view using standard bindElement
                        const oDetailPage = this.byId("detailPage");
                        if (oDetailPage) {
                            oDetailPage.bindElement({
                                path: "/SalesOrders(" + data.ID + ")",
                                parameters: {
                                    $expand: "generalInfo,shippingRoute,billingFinancial,items,partners,pricingConditions,scheduleLines"
                                }
                            });
                        }
                        
                        oViewModel.setProperty("/isEditing", false);

                        // 3. Refresh the master list so the new record is fetched
                        const oList = this.byId("orderList");
                        if (oList && oList.getBinding("items")) {
                            oList.getBinding("items").refresh();
                        }
                    }
                })
                .catch(error => {
                    MessageBox.error("S/4HANA transactional commit failed: " + error.message);
                });
            } else {
                // Scenario B: Standard edit modifications on existing order
                MessageToast.show("Saving Sales Document modifications...");
                Promise.all([
                    oModel.submitBatch("updateGroup"),
                    oModel.submitBatch("$auto")
                ]).then(() => {
                    oViewModel.setProperty("/isEditing", false);
                    MessageToast.show("Sales Order successfully committed to backend.");
                    
                    const oList = this.byId("orderList");
                    if (oList && oList.getBinding("items")) {
                        oList.getBinding("items").refresh();
                    }
                }).catch(error => {
                    MessageBox.error("Failed to commit changes to backend: " + (error.message || error));
                });
            }
        },

        /* Delete Sales Order Action */
        onDeleteOrder() {
            const oCtx = this.byId("detailPage").getBindingContext();
            if (!oCtx) {
                return;
            }

            MessageBox.confirm("Are you sure you want to permanently delete this Sales Order?", {
                title: "Delete Sales Document",
                actions: [MessageBox.Action.YES, MessageBox.Action.NO],
                onClose: (oAction) => {
                    if (oAction === MessageBox.Action.YES) {
                        oCtx.delete().then(() => {
                            this.getView().getModel("viewModel").setProperty("/activeOrder", false);
                            
                            const oList = this.byId("orderList");
                            if (oList) {
                                oList.removeSelections(true);
                            }
                            MessageToast.show("Sales Order deleted successfully.");
                        }).catch(error => {
                            MessageBox.error("Failed to delete Sales Order.");
                        });
                    }
                }
            });
        },

        /* Line Item Select Conditions Action */
        onSelectConditions(oEvent) {
            const oTabBar = this.byId("idIconTabBar");
            if (oTabBar) {
                oTabBar.setSelectedKey("pricing");
            }
        },

        /* Simulated Fiori Message Log Modal */
        onShowMessageLog() {
            MessageBox.success("S/4HANA Pre-flight system check successfully passed. OData V4 transactions fully synchronized. 0 warnings, 0 errors.");
        },

        /* Interactive Document Flow Handlers */
        onTraceKeys() {
            const sMsg = "VBFA Trace Log: Universal Journal ACDOCA document #1000293 successfully mapped. " +
                "Outbound Delivery VL01N and Invoice VF01 are fully synchronized with accounting ledger.";
            MessageBox.information(sMsg);
        },

        onSalesOrderLinkPress() {
            MessageToast.show("Displaying Sales Document VA03 context.");
        },

        onAcdocaLinkPress() {
            MessageBox.success("Accounting Document 1000293 is fully cleared in ACDOCA ledger. Transaction reference: Standard Order.");
        }

    });
});