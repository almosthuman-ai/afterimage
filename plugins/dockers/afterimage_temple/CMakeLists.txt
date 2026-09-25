set(TEMPLE_CORE_SOURCES TempleService.cpp TempleRecipe.cpp TempleToolGateway.cpp TempleStudioBridge.cpp)
set(TEMPLE_DOCK_SOURCES TemplePlugin.cpp TempleDock.cpp TemplePalette.cpp
    TempleStudioHost.cpp)
if(QT_MAJOR_VERSION EQUAL 5)
    qt5_add_resources(TEMPLE_RESOURCES temple.qrc)
else()
    qt_add_resources(TEMPLE_RESOURCES temple.qrc)
endif()
kis_add_library(afterimage_temple_core SHARED ${TEMPLE_CORE_SOURCES} ${TEMPLE_RESOURCES})
target_compile_definitions(afterimage_temple_core PRIVATE AFTERIMAGE_TEMPLE_CORE_BUILD)
target_include_directories(afterimage_temple_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(afterimage_temple_core kritaui Qt${QT_MAJOR_VERSION}::Concurrent)
install(TARGETS afterimage_temple_core ${INSTALL_TARGETS_DEFAULT_ARGS})

kis_add_library(kritaafterimagetemple MODULE ${TEMPLE_DOCK_SOURCES})
target_link_libraries(kritaafterimagetemple afterimage_temple_core kritaui Qt${QT_MAJOR_VERSION}::Concurrent)
if(WIN32)
    set(TEMPLE_WEBVIEW2_SDK_ROOT "$ENV{AFTERIMAGE_WEBVIEW2_SDK_ROOT}")
    if(NOT TEMPLE_WEBVIEW2_SDK_ROOT)
        set(TEMPLE_WEBVIEW2_SDK_ROOT "${CMAKE_SOURCE_DIR}/.afterimage/runtime/webview2-sdk/1.0.4191.47/package")
    endif()
    if(NOT EXISTS "${TEMPLE_WEBVIEW2_SDK_ROOT}/build/native/include/WebView2.h")
        message(FATAL_ERROR "Glitch Temple Studio needs official WebView2 SDK 1.0.4191.47 at ${TEMPLE_WEBVIEW2_SDK_ROOT}")
    endif()
    target_include_directories(kritaafterimagetemple PRIVATE "${TEMPLE_WEBVIEW2_SDK_ROOT}/build/native/include")
    target_link_libraries(kritaafterimagetemple ole32)
    install(FILES "${TEMPLE_WEBVIEW2_SDK_ROOT}/runtimes/win-x64/native/WebView2Loader.dll" DESTINATION bin)
    install(FILES "${TEMPLE_WEBVIEW2_SDK_ROOT}/LICENSE.txt"
        "${TEMPLE_WEBVIEW2_SDK_ROOT}/NOTICE.txt" DESTINATION bin/temple-studio/webview2-notices)
endif()
if(WIN32)
    find_program(TEMPLE_NPM_EXECUTABLE NAMES npm.cmd npm REQUIRED)
else()
    find_program(TEMPLE_NPM_EXECUTABLE npm REQUIRED)
endif()
file(GLOB_RECURSE TEMPLE_WEB_SOURCES CONFIGURE_DEPENDS
    "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/src/*.ts"
    "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/src/*.tsx"
    "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/src/*.css"
    "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/src/*.json")
add_custom_command(OUTPUT "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/dist/index.html"
    COMMAND "${TEMPLE_NPM_EXECUTABLE}" ci --no-audit --no-fund
    COMMAND "${TEMPLE_NPM_EXECUTABLE}" run build
    WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/studio_web"
    DEPENDS ${TEMPLE_WEB_SOURCES}
        "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/package.json"
        "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/package-lock.json"
        "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/index.html"
        "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/vite.config.ts"
        "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/tsconfig.json"
        "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/tsconfig.node.json"
    VERBATIM)
add_custom_target(afterimage_temple_studio_web ALL DEPENDS "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/dist/index.html")
add_dependencies(kritaafterimagetemple afterimage_temple_studio_web)
install(TARGETS kritaafterimagetemple DESTINATION ${KRITA_PLUGIN_INSTALL_DIR})
install(DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/dist/" DESTINATION bin/temple-studio)
install(FILES "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/LICENSE"
    "${CMAKE_CURRENT_SOURCE_DIR}/studio_web/UPSTREAM.md"
    "${CMAKE_CURRENT_SOURCE_DIR}/TEMPLE-LICENSE" DESTINATION bin/temple-studio)

find_package(Qt${QT_MAJOR_VERSION} QUIET COMPONENTS Test)
if(TARGET Qt${QT_MAJOR_VERSION}::Test)
    add_executable(afterimage_temple_workflow_tests EXCLUDE_FROM_ALL tests/TempleWorkflowTest.cpp)
    target_include_directories(afterimage_temple_workflow_tests PRIVATE ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR})
    target_link_libraries(afterimage_temple_workflow_tests afterimage_temple_core kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent)
    if(WIN32)
        add_executable(afterimage_temple_studio_host_tests EXCLUDE_FROM_ALL
            tests/TempleStudioHostTest.cpp TempleStudioHost.cpp)
        target_include_directories(afterimage_temple_studio_host_tests PRIVATE
            ${CMAKE_SOURCE_DIR}/sdk/tests ${CMAKE_BINARY_DIR}
            "${TEMPLE_WEBVIEW2_SDK_ROOT}/build/native/include")
        target_link_libraries(afterimage_temple_studio_host_tests
            afterimage_temple_core kritaui Qt${QT_MAJOR_VERSION}::Test Qt${QT_MAJOR_VERSION}::Concurrent ole32)
    endif()
endif()
