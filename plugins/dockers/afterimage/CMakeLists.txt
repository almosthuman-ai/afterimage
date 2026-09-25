set(AFTERIMAGE_SOURCES AfterimagePlugin.cpp AfterimageDock.cpp AfterimageSession.cpp AfterimageImageStore.cpp AfterimageDocumentBridge.cpp)
kis_add_library(kritaafterimage MODULE ${AFTERIMAGE_SOURCES})
target_link_libraries(kritaafterimage kritaui Qt${QT_MAJOR_VERSION}::Concurrent)
install(TARGETS kritaafterimage DESTINATION ${KRITA_PLUGIN_INSTALL_DIR})
