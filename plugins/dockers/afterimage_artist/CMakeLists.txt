kis_add_library(afterimage_artist_core SHARED ArtistNative.cpp ArtistToolGateway.cpp ComicProject.cpp)
target_compile_definitions(afterimage_artist_core PRIVATE AFTERIMAGE_ARTIST_CORE_BUILD)
target_include_directories(afterimage_artist_core PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})
target_link_libraries(afterimage_artist_core kritaui Qt${QT_MAJOR_VERSION}::Concurrent Qt${QT_MAJOR_VERSION}::PrintSupport ${PNG_LIBRARIES})
install(TARGETS afterimage_artist_core ${INSTALL_TARGETS_DEFAULT_ARGS})

add_executable(afterimage_comic_pdf_worker WIN32 ComicPdfWorker.cpp)
target_link_libraries(afterimage_comic_pdf_worker afterimage_artist_core kritaui Qt${QT_MAJOR_VERSION}::PrintSupport)
install(TARGETS afterimage_comic_pdf_worker ${INSTALL_TARGETS_DEFAULT_ARGS})

kis_add_library(kritaafterimageartist MODULE ArtistPlugin.cpp PixelDock.cpp ComicDock.cpp)
set_source_files_properties(ArtistPlugin.cpp PROPERTIES OBJECT_DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/krita_afterimageartist.json)
target_link_libraries(kritaafterimageartist afterimage_artist_core kritaui Qt${QT_MAJOR_VERSION}::Concurrent)
install(TARGETS kritaafterimageartist DESTINATION ${KRITA_PLUGIN_INSTALL_DIR})
