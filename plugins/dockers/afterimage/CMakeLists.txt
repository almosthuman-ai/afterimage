set(AFTERIMAGE_SOURCES AfterimagePlugin.cpp AfterimageDock.cpp AfterimageSession.cpp AfterimageImageStore.cpp AfterimageDocumentBridge.cpp AfterimageCompositorImport.cpp)
kis_add_library(kritaafterimage MODULE ${AFTERIMAGE_SOURCES})
target_link_libraries(kritaafterimage kritaui Qt${QT_MAJOR_VERSION}::Concurrent afterimage_temple_core afterimage_artist_core)
install(TARGETS kritaafterimage DESTINATION ${KRITA_PLUGIN_INSTALL_DIR})

# One native workflow check, built explicitly without enabling upstream's entire test suite.
find_package(Qt${QT_MAJOR_VERSION} QUIET COMPONENTS Test)
if(TARGET Qt${QT_MAJOR_VERSION}::Test)
    add_executable(afterimage_workflow_tests EXCLUDE_FROM_ALL tests/WorkflowTest.cpp AfterimageDocumentBridge.cpp AfterimageImageStore.cpp AfterimageCompositorImport.cpp)
    target_include_directories(afterimage_workflow_tests PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_workflow_tests kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent afterimage_temple_core afterimage_artist_core)
    add_executable(afterimage_conversation_preview EXCLUDE_FROM_ALL tests/ConversationPreview.cpp
        AfterimageDock.cpp AfterimageSession.cpp AfterimageImageStore.cpp AfterimageDocumentBridge.cpp AfterimageCompositorImport.cpp)
    target_include_directories(afterimage_conversation_preview PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_conversation_preview kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent afterimage_temple_core afterimage_artist_core)
    add_executable(afterimage_live_agent_workflow EXCLUDE_FROM_ALL tests/LiveAgentWorkflow.cpp
        AfterimageSession.cpp AfterimageDocumentBridge.cpp)
    target_include_directories(afterimage_live_agent_workflow PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_live_agent_workflow kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent afterimage_temple_core afterimage_artist_core)
    add_executable(afterimage_live_subscription_edit EXCLUDE_FROM_ALL tests/LiveSubscriptionEdit.cpp
        AfterimageSession.cpp AfterimageDocumentBridge.cpp AfterimageImageStore.cpp)
    target_include_directories(afterimage_live_subscription_edit PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_live_subscription_edit kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent afterimage_temple_core afterimage_artist_core)
endif()
