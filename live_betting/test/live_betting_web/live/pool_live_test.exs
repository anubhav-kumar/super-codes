defmodule LiveBettingWeb.PoolLiveTest do
  use LiveBettingWeb.ConnCase

  import Phoenix.LiveViewTest
  import LiveBetting.MatchesFixtures

  @create_attrs %{team: "some team", total_amount: "120.5", total_weight: "120.5"}
  @update_attrs %{team: "some updated team", total_amount: "456.7", total_weight: "456.7"}
  @invalid_attrs %{team: nil, total_amount: nil, total_weight: nil}
  defp create_pool(_) do
    pool = pool_fixture()

    %{pool: pool}
  end

  describe "Index" do
    setup [:create_pool]

    test "lists all pools", %{conn: conn, pool: pool} do
      {:ok, _index_live, html} = live(conn, ~p"/pools")

      assert html =~ "Listing Pools"
      assert html =~ pool.team
    end

    test "saves new pool", %{conn: conn} do
      {:ok, index_live, _html} = live(conn, ~p"/pools")

      assert {:ok, form_live, _} =
               index_live
               |> element("a", "New Pool")
               |> render_click()
               |> follow_redirect(conn, ~p"/pools/new")

      assert render(form_live) =~ "New Pool"

      assert form_live
             |> form("#pool-form", pool: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#pool-form", pool: @create_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/pools")

      html = render(index_live)
      assert html =~ "Pool created successfully"
      assert html =~ "some team"
    end

    test "updates pool in listing", %{conn: conn, pool: pool} do
      {:ok, index_live, _html} = live(conn, ~p"/pools")

      assert {:ok, form_live, _html} =
               index_live
               |> element("#pools-#{pool.id} a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/pools/#{pool}/edit")

      assert render(form_live) =~ "Edit Pool"

      assert form_live
             |> form("#pool-form", pool: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, index_live, _html} =
               form_live
               |> form("#pool-form", pool: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/pools")

      html = render(index_live)
      assert html =~ "Pool updated successfully"
      assert html =~ "some updated team"
    end

    test "deletes pool in listing", %{conn: conn, pool: pool} do
      {:ok, index_live, _html} = live(conn, ~p"/pools")

      assert index_live |> element("#pools-#{pool.id} a", "Delete") |> render_click()
      refute has_element?(index_live, "#pools-#{pool.id}")
    end
  end

  describe "Show" do
    setup [:create_pool]

    test "displays pool", %{conn: conn, pool: pool} do
      {:ok, _show_live, html} = live(conn, ~p"/pools/#{pool}")

      assert html =~ "Show Pool"
      assert html =~ pool.team
    end

    test "updates pool and returns to show", %{conn: conn, pool: pool} do
      {:ok, show_live, _html} = live(conn, ~p"/pools/#{pool}")

      assert {:ok, form_live, _} =
               show_live
               |> element("a", "Edit")
               |> render_click()
               |> follow_redirect(conn, ~p"/pools/#{pool}/edit?return_to=show")

      assert render(form_live) =~ "Edit Pool"

      assert form_live
             |> form("#pool-form", pool: @invalid_attrs)
             |> render_change() =~ "can&#39;t be blank"

      assert {:ok, show_live, _html} =
               form_live
               |> form("#pool-form", pool: @update_attrs)
               |> render_submit()
               |> follow_redirect(conn, ~p"/pools/#{pool}")

      html = render(show_live)
      assert html =~ "Pool updated successfully"
      assert html =~ "some updated team"
    end
  end
end
