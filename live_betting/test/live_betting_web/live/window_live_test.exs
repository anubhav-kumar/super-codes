defmodule LiveBettingWeb.WindowLiveTest do
  use LiveBettingWeb.ConnCase

  import Phoenix.LiveViewTest
  import LiveBetting.MatchesFixtures

  @create_attrs %{status: "some status", sequence_number: 42, opens_at: "2026-02-26T21:04:00Z", closes_at: "2026-02-26T21:04:00Z", duration_seconds: 42, resolution_type: "some resolution_type", winning_team: "some winning_team", house_takeout_pct: "120.5"}
  @update_attrs %{status: "some updated status", sequence_number: 43, opens_at: "2026-02-27T21:04:00Z", closes_at: "2026-02-27T21:04:00Z", duration_seconds: 43, resolution_type: "some updated resolution_type", winning_team: "some updated winning_team", house_takeout_pct: "456.7"}
  @invalid_attrs %{status: nil, sequence_number: nil, opens_at: nil, closes_at: nil, duration_seconds: nil, resolution_type: nil, winning_team: nil, house_takeout_pct: nil}
  defp create_window(_) do
    window = window_fixture()

    %{window: window}
  end

  describe "Index" do
    setup [:create_window]

    test "lists all windows", %{conn: conn, window: window} do
      {:ok, _index_live, html} = live(conn, ~p"/windows")

      assert html =~ "Listing Windows"
      assert html =~ window.status
    end

    test "saves new window", %{conn: conn} do
      {:ok, index_live, _html} = live(conn, ~p"/windows")

      assert {:ok, form_live, _} =
               index_live
               |> element("a", "New Window")
               |> render_click()
               |> follow_redirect(conn, ~p"/windows/new")

      assert render(form_live) =~ "New Window"

      assert form_live
             |> form("#window-form", window: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#window-form", window: @create_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/windows")

      html = render(index_live)
      assert html =~ "Window created successfully"
      assert html =~ "some status"
    end

    test "updates window in listing", %{conn: conn, window: window} do
      {:ok, index_live, _html} = live(conn, ~p"/windows")

      assert {:ok, form_live, _html} =
               index_live
               |> element("#windows-#{window.id} a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/windows/#{window}/edit")

      assert render(form_live) =~ "Edit Window"

      assert form_live
             |> form("#window-form", window: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#window-form", window: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/windows")

      html = render(index_live)
      assert html =~ "Window updated successfully"
      assert html =~ "some updated status"
    end

    test "deletes window in listing", %{conn: conn, window: window} do
      {:ok, index_live, _html} = live(conn, ~p"/windows")

      assert index_live |> element("#windows-#{window.id} a", "Delete") |> render_click()
      refute has_element?(index_live, "#windows-#{window.id}")
    end
  end

  describe "Show" do
    setup [:create_window]

    test "displays window", %{conn: conn, window: window} do
      {:ok, _show_live, html} = live(conn, ~p"/windows/#{window}")

      assert html =~ "Show Window"
      assert html =~ window.status
    end

    test "updates window and returns to show", %{conn: conn, window: window} do
      {:ok, show_live, _html} = live(conn, ~p"/windows/#{window}")

      assert {:ok, form_live, _} =
               show_live
               |> element("a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/windows/#{window}/edit?return_to=show")

      assert render(form_live) =~ "Edit Window"

      assert form_live
             |> form("#window-form", window: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, show_live, _html} =
               form_live
               |> form("#window-form", window: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/windows/#{window}")

      html = render(show_live)
      assert html =~ "Window updated successfully"
      assert html =~ "some updated status"
    end
  end
end
