set(AFTERIMAGE_SOURCES AfterimagePlugin.cpp AfterimageDock.cpp AfterimageSession.cpp AfterimageImageStore.cpp AfterimageDocumentBridge.cpp AfterimageApiImages.cpp AfterimageCompositorImport.cpp)
kis_add_library(kritaafterimage MODULE ${AFTERIMAGE_SOURCES})
target_link_libraries(kritaafterimage kritaui Qt${QT_MAJOR_VERSION}::Concurrent Qt${QT_MAJOR_VERSION}::Network afterimage_temple_core afterimage_artist_core)
if(WIN32)
    target_link_libraries(kritaafterimage Advapi32)
endif()
install(TARGETS kritaafterimage DESTINATION ${KRITA_PLUGIN_INSTALL_DIR})

# One native workflow check, built explicitly without enabling upstream's entire test suite.
find_package(Qt${QT_MAJOR_VERSION} QUIET COMPONENTS Test)
if(TARGET Qt${QT_MAJOR_VERSION}::Test)
    add_executable(afterimage_api_images_tests EXCLUDE_FROM_ALL tests/ApiImagesTest.cpp
        AfterimageApiImages.cpp AfterimageImageStore.cpp AfterimageDocumentBridge.cpp)
    target_include_directories(afterimage_api_images_tests PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_api_images_tests kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent
        Qt${QT_MAJOR_VERSION}::Network afterimage_temple_core afterimage_artist_core)
    add_executable(afterimage_live_api_artwork EXCLUDE_FROM_ALL tests/LiveApiArtwork.cpp
        AfterimageApiImages.cpp AfterimageImageStore.cpp AfterimageDocumentBridge.cpp)
    target_include_directories(afterimage_live_api_artwork PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_live_api_artwork kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent
        Qt${QT_MAJOR_VERSION}::Network afterimage_temple_core afterimage_artist_core)
    add_executable(afterimage_workflow_tests EXCLUDE_FROM_ALL tests/WorkflowTest.cpp AfterimageDocumentBridge.cpp AfterimageApiImages.cpp AfterimageImageStore.cpp AfterimageCompositorImport.cpp)
    target_include_directories(afterimage_workflow_tests PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_workflow_tests kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent Qt${QT_MAJOR_VERSION}::Network afterimage_temple_core afterimage_artist_core)
    add_executable(afterimage_conversation_preview EXCLUDE_FROM_ALL tests/ConversationPreview.cpp
        AfterimageDock.cpp AfterimageSession.cpp AfterimageImageStore.cpp AfterimageDocumentBridge.cpp AfterimageApiImages.cpp AfterimageCompositorImport.cpp)
    target_include_directories(afterimage_conversation_preview PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_conversation_preview kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent Qt${QT_MAJOR_VERSION}::Network afterimage_temple_core afterimage_artist_core)
    add_executable(afterimage_live_agent_workflow EXCLUDE_FROM_ALL tests/LiveAgentWorkflow.cpp
        AfterimageSession.cpp AfterimageDocumentBridge.cpp AfterimageApiImages.cpp AfterimageImageStore.cpp)
    target_include_directories(afterimage_live_agent_workflow PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_live_agent_workflow kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent Qt${QT_MAJOR_VERSION}::Network afterimage_temple_core afterimage_artist_core)
    add_executable(afterimage_live_subscription_edit EXCLUDE_FROM_ALL tests/LiveSubscriptionEdit.cpp
        AfterimageSession.cpp AfterimageDocumentBridge.cpp AfterimageApiImages.cpp AfterimageImageStore.cpp)
    target_include_directories(afterimage_live_subscription_edit PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_live_subscription_edit kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent Qt${QT_MAJOR_VERSION}::Network afterimage_temple_core afterimage_artist_core)
    if(WIN32)
        foreach(target afterimage_api_images_tests afterimage_live_api_artwork afterimage_workflow_tests afterimage_conversation_preview afterimage_live_agent_workflow afterimage_live_subscription_edit)
            target_link_libraries(${target} Advapi32)
        endforeach()
    endif()
endif()
